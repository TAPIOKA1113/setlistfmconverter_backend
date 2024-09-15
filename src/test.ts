function extractBracketContent(text: string): string | null {
    const regex = /\[(.*?)\]/;
    const match = text.match(regex);

    console.log(match);

    if (match && match[1]) {
        return match[1];
    }

    return null;
}

// Usage example
const text = "Jane Says [Jane's Addiction]";
const result = extractBracketContent(text);

if (result !== null) {
    console.log("Text contains brackets: true");
    console.log("Extracted content:", result);
} else {
    console.log("Text contains brackets: false");
}