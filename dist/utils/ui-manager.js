/**
 * UI Manager for handling CLI output and user interaction
 */
export class UIManager {
    consoleLock;
    constructor() {
        this.consoleLock = {
            queue: [],
            isLocked: false,
            async log(message) {
                return new Promise((resolve) => {
                    const executeLog = () => {
                        console.log(message);
                        this.isLocked = false;
                        resolve();
                        this._processQueue();
                    };
                    if (this.isLocked) {
                        this.queue.push(executeLog);
                    }
                    else {
                        this.isLocked = true;
                        executeLog();
                    }
                });
            },
            _processQueue() {
                if (this.queue.length > 0 && !this.isLocked) {
                    this.isLocked = true;
                    const nextLog = this.queue.shift();
                    if (nextLog)
                        nextLog();
                }
            },
        };
    }
    /**
     * Log a message safely preventing overlap
     */
    async log(message) {
        await this.consoleLock.log(message);
    }
    /**
     * Display global summary of translation
     */
    async displayGlobalSummary(stats, totalLanguages) {
        await this.log("\n" + "=".repeat(60));
        await this.log("Global Translation Summary");
        await this.log("=".repeat(60));
        await this.log(`\nLanguages Processed: ${totalLanguages}`);
        await this.log(`Total Translations: ${stats.total}`);
        await this.log(`Success: ${stats.success}`);
        await this.log(`Failed: ${stats.failed}`);
        await this.log(`Skipped: ${stats.skipped}`);
        await this.log(`Total Time: ${stats.totalTime?.toFixed(1) || 0}s`);
        await this.log(`Average per language: ${(stats.totalTime / (totalLanguages || 1)).toFixed(1)}s`);
        // Display detailed language stats
        if (Object.keys(stats.languages).length > 0) {
            await this.log("\n" + "-".repeat(60));
            await this.log("Per-language Performance:");
            await this.log("-".repeat(60));
            for (const [lang, langStats] of Object.entries(stats.languages)) {
                const timeSeconds = langStats.timeMs / 1000;
                await this.log(`  ${lang.padEnd(4)} | ${String(langStats.added).padStart(3)} added | ${String(langStats.skipped).padStart(3)} skipped | ${String(langStats.failed).padStart(2)} failed | ${timeSeconds.toFixed(1)}s`);
            }
        }
        // Only show categories if we have them
        if (Object.keys(stats.byCategory).length > 0) {
            await this.log("\n" + "-".repeat(60));
            await this.log("Context Analysis by Category:");
            await this.log("-".repeat(60));
            for (const [category, count] of Object.entries(stats.byCategory)) {
                const details = stats.details[category];
                if (details && details.samples > 0) {
                    const avgConfidence = details.totalConfidence / details.samples;
                    const confidenceStr = `${(avgConfidence * 100).toFixed(1)}%`;
                    await this.log(`  ${category}: ${count} items (${confidenceStr} avg confidence)`);
                }
                else {
                    await this.log(`  ${category}: ${count} items`);
                }
            }
        }
        // Clear completion message - only once
        await this.log("\n" + "=".repeat(60));
        const duration = stats.totalDuration || 0;
        await this.log(`All operations completed successfully in ${duration.toFixed(1)}s`);
        await this.log("=".repeat(60) + "\n");
    }
    async logBatchResults(batchResults) {
        for (const result of batchResults) {
            if (result && result.savedMessage) {
                await this.log(result.savedMessage);
            }
        }
    }
}
export default new UIManager();
