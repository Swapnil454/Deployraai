class LogWriter {
  async write(logs: any[]): Promise<void> {
    // Placeholder for log writing logic (ClickHouse/PostgreSQL)
    console.log(`Writing ${logs.length} logs to database`);
  }
}

export const logWriter = new LogWriter();
