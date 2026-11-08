# Data flows

- **Input files** are read only from paths you name on the command line.
  Nothing is uploaded.
- **Network**: only `sourcebook collect hf --online` (or `fetch_hub_dataset`
  in Python) makes requests, only to `https://huggingface.co`, only for the
  dataset ids you name, without cookies, credentials or tokens. Every other
  command works offline.
- **Output** goes to standard output or to the paths you name with `--out`
  and `--list-out`. Existing files are not overwritten without `--force`;
  symbolic links are never written through.
- **No telemetry.** Sourcebook does not collect or send usage data.
- **Personal data.** A summary describes training data in general terms; the
  template does not ask for personal data beyond the provider's contact
  details. Crawl logs contain URLs; they are processed in memory and only
  registrable domain names, sizes and counts are written to the report.
