/**
 * Simple yet robust CSV parser
 * Handles quoted fields and auto-detects common delimiters
 */
export const parseCSV = (text: string): string[][] => {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return [];

    // Detect delimiter from first line
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    let delimiter = ',';
    if (semiCount > commaCount) delimiter = ';';
    if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

    return lines.map(line => {
        // Handle quoted fields
        const row: string[] = [];
        let currentField = '';
        let insideQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (char === '"') {
                if (insideQuotes && nextChar === '"') {
                    currentField += '"';
                    i++; // Skip escape quote
                } else {
                    insideQuotes = !insideQuotes;
                }
            } else if (char === delimiter && !insideQuotes) {
                row.push(currentField.trim());
                currentField = '';
            } else {
                currentField += char;
            }
        }
        row.push(currentField.trim());
        return row;
    });
};
