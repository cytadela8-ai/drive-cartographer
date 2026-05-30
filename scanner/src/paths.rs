#[derive(Debug, Eq, PartialEq)]
pub struct RelativePathParts {
    pub parent_relative_path: String,
    pub basename: String,
}

pub fn split_relative_path(relative_path: &str) -> RelativePathParts {
    let normalized = relative_path.replace('\\', "/");
    let trimmed = normalized.trim_matches('/');

    match trimmed.rsplit_once('/') {
        Some((parent, basename)) => RelativePathParts {
            parent_relative_path: parent.to_string(),
            basename: basename.to_string(),
        },
        None => RelativePathParts {
            parent_relative_path: String::new(),
            basename: trimmed.to_string(),
        },
    }
}
