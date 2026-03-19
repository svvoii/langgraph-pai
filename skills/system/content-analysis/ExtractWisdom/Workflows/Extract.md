# Extract Workflow

Extract dynamic, content-adaptive insights from source material.

## Input Sources

| Source | Method |
|---|---|
| YouTube URL | Fetch transcript externally, then pass transcript text |
| Article URL | Use web fetch and clean extracted content |
| File path | Read file content directly |
| Pasted text | Use content as-is |

## Execution Steps

1. Acquire the full source text.
2. Read deeply before extracting bullets.
3. Identify the core wisdom domains.
4. Build dynamic section names from those domains.
5. Extract high-signal bullets per section.
6. Add closing sections based on depth level.
7. Run a quality pass for specificity and clarity.

## Output Structure

- Dynamic sections with bullets
- One-Sentence Takeaway
- If You Only Have 2 Minutes
- References and Rabbit Holes
