use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScannerError {
    #[error("invalid relative path: {path}")]
    InvalidRelativePath { path: String },

    #[error("failed filesystem operation on {path}: {source}")]
    Io {
        path: String,
        #[source]
        source: std::io::Error,
    },

    #[error("failed to read directory entry: {0}")]
    WalkDir(#[from] walkdir::Error),

    #[error("failed to write CSV: {0}")]
    Csv(#[from] csv::Error),

    #[error("failed to flush CSV output: {0}")]
    CsvFlush(#[source] std::io::Error),

    #[error("failed scanner cache operation: {0}")]
    Cache(#[from] rusqlite::Error),

    #[error("failed to parse scanner config {path}: {source}")]
    Config {
        path: String,
        #[source]
        source: toml::de::Error,
    },

    #[error("invalid exclude pattern {pattern}: {source}")]
    ExcludePattern {
        pattern: String,
        #[source]
        source: globset::Error,
    },

    #[error("failed to format timestamp: {0}")]
    TimeFormat(#[from] time::error::Format),

    #[error("root path does not exist or is not a directory: {path}")]
    InvalidRoot { path: String },

    #[error("upload is not configured for artifact: {path}")]
    UploadNotConfigured { path: String },

    #[error("failed to upload artifact {path}: {source}")]
    Upload {
        path: String,
        #[source]
        source: Box<ureq::Error>,
    },

    #[error("artifact upload failed with HTTP status {status}")]
    UploadStatus { status: u16 },
}
