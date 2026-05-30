use crate::errors::ScannerError;
use std::path::Path;

pub fn upload_artifact(path: &Path, server_url: Option<&str>) -> Result<(), ScannerError> {
    if server_url.is_some() {
        return Ok(());
    }

    Err(ScannerError::UploadNotConfigured {
        path: path.display().to_string(),
    })
}
