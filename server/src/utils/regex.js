/**
 * Escapes regular expression special characters from a string.
 * This is critical to prevent Regular Expression Denial of Service (ReDoS) 
 * when taking user input and constructing dynamic RegExp objects or MongoDB $regex queries.
 */
export function escapeRegex(string) {
    if (typeof string !== 'string') return string;
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}
