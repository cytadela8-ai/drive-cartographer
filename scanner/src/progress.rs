use indicatif::{ProgressBar, ProgressStyle};
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

pub trait ProgressReporter {
    fn begin_enumeration(&mut self) {}
    fn record_enumerated_file(&mut self, _size_bytes: u64) {}
    fn finish_enumeration(&mut self, _files: u64, _bytes: u64) {}
    fn begin_processing(&mut self, _files: u64, _bytes: u64) {}
    fn record_processed_file(&mut self, _size_bytes: u64) {}
    fn finish_processing(&mut self, _files: u64, _cache_hits: u64) {}
    fn begin_finalization(&mut self) {}
    fn finish_finalization(&mut self) {}
    fn begin_upload(&mut self) {}
    fn finish_upload(&mut self) {}
}

#[derive(Debug, Default)]
pub struct NoopProgressReporter;

impl ProgressReporter for NoopProgressReporter {}

pub struct TerminalProgressReporter {
    active: Option<ProgressBar>,
    processed_bytes: u64,
}

impl TerminalProgressReporter {
    pub fn new() -> Self {
        Self {
            active: None,
            processed_bytes: 0,
        }
    }

    fn start_spinner(&mut self, message: &'static str) {
        let spinner = ProgressBar::new_spinner();
        spinner.set_style(spinner_style());
        spinner.enable_steady_tick(std::time::Duration::from_millis(120));
        spinner.set_message(message);
        self.active = Some(spinner);
    }

    fn start_bar(&mut self, files: u64, bytes: u64) {
        let bar = ProgressBar::new(files);
        bar.set_style(bar_style());
        bar.set_message(format!("processing files ({})", human_bytes(bytes)));
        self.processed_bytes = 0;
        self.active = Some(bar);
    }

    fn finish_active(&mut self, message: String) {
        let Some(progress) = self.active.take() else {
            return;
        };
        progress.finish_with_message(message);
    }
}

impl Default for TerminalProgressReporter {
    fn default() -> Self {
        Self::new()
    }
}

impl ProgressReporter for TerminalProgressReporter {
    fn begin_enumeration(&mut self) {
        self.start_spinner("enumerating files");
    }

    fn record_enumerated_file(&mut self, _size_bytes: u64) {
        if let Some(progress) = &self.active {
            progress.inc(1);
        }
    }

    fn finish_enumeration(&mut self, files: u64, bytes: u64) {
        self.finish_active(format!("enumerated {files} files ({})", human_bytes(bytes)));
    }

    fn begin_processing(&mut self, files: u64, bytes: u64) {
        self.start_bar(files, bytes);
    }

    fn record_processed_file(&mut self, size_bytes: u64) {
        self.processed_bytes += size_bytes;
        if let Some(progress) = &self.active {
            progress.inc(1);
            progress.set_message(format!("processed {}", human_bytes(self.processed_bytes)));
        }
    }

    fn finish_processing(&mut self, files: u64, cache_hits: u64) {
        self.finish_active(format!("processed {files} files, {cache_hits} cache hits"));
    }

    fn begin_finalization(&mut self) {
        self.start_spinner("finalizing csv");
    }

    fn finish_finalization(&mut self) {
        self.finish_active("csv finalized".to_string());
    }

    fn begin_upload(&mut self) {
        self.start_spinner("uploading artifact");
    }

    fn finish_upload(&mut self) {
        self.finish_active("artifact uploaded".to_string());
    }
}

pub fn terminal_or_noop(show_progress: bool) -> Box<dyn ProgressReporter> {
    if show_progress {
        return Box::new(TerminalProgressReporter::new());
    }

    Box::<NoopProgressReporter>::default()
}

fn spinner_style() -> ProgressStyle {
    ProgressStyle::with_template("{spinner:.cyan} {msg}")
        .expect("spinner progress template is valid")
}

fn bar_style() -> ProgressStyle {
    ProgressStyle::with_template(
        "{bar:32.cyan/blue} {pos:>7}/{len:7} files {msg} {elapsed_precise}",
    )
    .expect("bar progress template is valid")
    .progress_chars("=> ")
}

fn human_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KiB", "MiB", "GiB"];
    let mut value = bytes as f64;
    let mut unit = UNITS[0];
    for candidate in UNITS.iter().skip(1) {
        if value < 1024.0 {
            break;
        }
        value /= 1024.0;
        unit = candidate;
    }

    if unit == "B" {
        return format!("{bytes} B");
    }
    format!("{value:.1} {unit}")
}
