use thiserror::Error;

#[derive(Debug, Error)]
pub enum ScannerError {
    #[error("invalid relative path: {path}")]
    InvalidRelativePath { path: String },
}
