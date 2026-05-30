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

    #[error("failed to format timestamp: {0}")]
    TimeFormat(#[from] time::error::Format),

    #[error("root path does not exist or is not a directory: {path}")]
    InvalidRoot { path: String },

    #[error("upload is not configured for artifact: {path}")]
    UploadNotConfigured { path: String },
}
