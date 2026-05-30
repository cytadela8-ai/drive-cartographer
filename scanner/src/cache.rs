use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct CacheLookup<'a> {
    pub source_name: &'a str,
    pub root_label: &'a str,
    pub absolute_path: &'a str,
    pub platform_file_id: Option<&'a str>,
    pub size_bytes: u64,
    pub modified_at_fs: &'a str,
}

pub struct HashCache {
    connection: Connection,
}

impl HashCache {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        let connection = Connection::open(path)?;
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS file_hash_cache (
                source_name TEXT NOT NULL,
                root_label TEXT NOT NULL,
                absolute_path TEXT NOT NULL,
                platform_file_id TEXT,
                size_bytes INTEGER NOT NULL,
                modified_at_fs TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                PRIMARY KEY (source_name, root_label, absolute_path)
            );",
        )?;
        add_platform_file_id_column(&connection)?;
        connection.execute_batch(
            "CREATE INDEX IF NOT EXISTS file_hash_cache_platform_file_id_idx
             ON file_hash_cache (
                source_name,
                root_label,
                platform_file_id,
                size_bytes,
                modified_at_fs
             )
             WHERE platform_file_id IS NOT NULL;",
        )?;

        Ok(Self { connection })
    }

    pub fn get(&self, lookup: &CacheLookup<'_>) -> rusqlite::Result<Option<String>> {
        if let Some(sha256) = self.get_by_platform_file_id(lookup)? {
            return Ok(Some(sha256));
        }

        self.get_by_absolute_path(lookup)
    }

    fn get_by_platform_file_id(
        &self,
        lookup: &CacheLookup<'_>,
    ) -> rusqlite::Result<Option<String>> {
        let Some(platform_file_id) = lookup.platform_file_id else {
            return Ok(None);
        };

        self.connection
            .query_row(
                "SELECT sha256
                 FROM file_hash_cache
                 WHERE source_name = ?1
                   AND root_label = ?2
                   AND platform_file_id = ?3
                   AND size_bytes = ?4
                   AND modified_at_fs = ?5
                 LIMIT 1",
                params![
                    lookup.source_name,
                    lookup.root_label,
                    platform_file_id,
                    lookup.size_bytes,
                    lookup.modified_at_fs,
                ],
                |row| row.get(0),
            )
            .optional()
    }

    fn get_by_absolute_path(&self, lookup: &CacheLookup<'_>) -> rusqlite::Result<Option<String>> {
        self.connection
            .query_row(
                "SELECT sha256
                 FROM file_hash_cache
                 WHERE source_name = ?1
                   AND root_label = ?2
                   AND absolute_path = ?3
                   AND platform_file_id IS ?4
                   AND size_bytes = ?5
                   AND modified_at_fs = ?6",
                params![
                    lookup.source_name,
                    lookup.root_label,
                    lookup.absolute_path,
                    lookup.platform_file_id,
                    lookup.size_bytes,
                    lookup.modified_at_fs,
                ],
                |row| row.get(0),
            )
            .optional()
    }

    pub fn put(&self, lookup: &CacheLookup<'_>, sha256: &str) -> rusqlite::Result<()> {
        self.connection.execute(
            "INSERT INTO file_hash_cache (
                source_name,
                root_label,
                absolute_path,
                platform_file_id,
                size_bytes,
                modified_at_fs,
                sha256
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(source_name, root_label, absolute_path)
            DO UPDATE SET
                platform_file_id = excluded.platform_file_id,
                size_bytes = excluded.size_bytes,
                modified_at_fs = excluded.modified_at_fs,
                sha256 = excluded.sha256",
            params![
                lookup.source_name,
                lookup.root_label,
                lookup.absolute_path,
                lookup.platform_file_id,
                lookup.size_bytes,
                lookup.modified_at_fs,
                sha256,
            ],
        )?;
        Ok(())
    }
}

fn add_platform_file_id_column(connection: &Connection) -> rusqlite::Result<()> {
    let already_exists = connection
        .prepare("SELECT platform_file_id FROM file_hash_cache LIMIT 0")
        .is_ok();
    if already_exists {
        return Ok(());
    }

    connection.execute(
        "ALTER TABLE file_hash_cache ADD COLUMN platform_file_id TEXT",
        [],
    )?;
    Ok(())
}
