use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct CacheLookup<'a> {
    pub source_name: &'a str,
    pub root_label: &'a str,
    pub absolute_path: &'a str,
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
                size_bytes INTEGER NOT NULL,
                modified_at_fs TEXT NOT NULL,
                sha256 TEXT NOT NULL,
                PRIMARY KEY (source_name, root_label, absolute_path)
            );",
        )?;

        Ok(Self { connection })
    }

    pub fn get(&self, lookup: &CacheLookup<'_>) -> rusqlite::Result<Option<String>> {
        self.connection
            .query_row(
                "SELECT sha256
                 FROM file_hash_cache
                 WHERE source_name = ?1
                   AND root_label = ?2
                   AND absolute_path = ?3
                   AND size_bytes = ?4
                   AND modified_at_fs = ?5",
                params![
                    lookup.source_name,
                    lookup.root_label,
                    lookup.absolute_path,
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
                size_bytes,
                modified_at_fs,
                sha256
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(source_name, root_label, absolute_path)
            DO UPDATE SET
                size_bytes = excluded.size_bytes,
                modified_at_fs = excluded.modified_at_fs,
                sha256 = excluded.sha256",
            params![
                lookup.source_name,
                lookup.root_label,
                lookup.absolute_path,
                lookup.size_bytes,
                lookup.modified_at_fs,
                sha256,
            ],
        )?;
        Ok(())
    }
}
