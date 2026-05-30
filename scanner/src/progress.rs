#[derive(Debug, Default)]
pub struct ScanProgress {
    files_seen: u64,
    bytes_seen: u64,
}

impl ScanProgress {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn record_file(&mut self, size_bytes: u64) {
        self.files_seen += 1;
        self.bytes_seen += size_bytes;
    }

    pub fn files_seen(&self) -> u64 {
        self.files_seen
    }

    pub fn bytes_seen(&self) -> u64 {
        self.bytes_seen
    }
}
