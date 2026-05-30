use crate::errors::ScannerError;
use std::path::Path;
use ureq::unversioned::multipart::Form;

pub fn upload_artifact(path: &Path, server_url: Option<&str>) -> Result<(), ScannerError> {
    let Some(server_url) = server_url else {
        return Err(ScannerError::UploadNotConfigured {
            path: path.display().to_string(),
        });
    };

    let form = Form::new()
        .file("artifact", path)
        .map_err(|source| ScannerError::Io {
            path: path.display().to_string(),
            source,
        })?;
    let response = ureq::post(&upload_url(server_url))
        .send(form)
        .map_err(|source| upload_error(path, source))?;
    if !response.status().is_success() {
        return Err(ScannerError::UploadStatus {
            status: response.status().as_u16(),
        });
    }

    Ok(())
}

fn upload_url(server_url: &str) -> String {
    format!("{}/api/artifacts/upload", server_url.trim_end_matches('/'))
}

fn upload_error(path: &Path, source: ureq::Error) -> ScannerError {
    ScannerError::Upload {
        path: path.display().to_string(),
        source: Box::new(source),
    }
}
