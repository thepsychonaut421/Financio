# **App Name**: PDF Data Extractor

## Core Features:

- Bulk PDF Upload: Enable users to upload multiple PDF files at once via a drag-and-drop interface or file selection dialog.
- AI-Powered Data Extraction: Leverage the Gemini Vision AI tool (or a `pdf-to-text` fallback) within a Firebase Function to extract structured data (product code, name, quantity, unit price) from uploaded PDFs.
- Data Normalization and Deduplication: Implement data normalization logic to standardize extracted information (e.g., remove extra spaces, handle inconsistencies) and eliminate duplicate entries based on product code.
- Interactive Data Table: Present the extracted and normalized data in a sortable, searchable, and responsive table.
- Copy to Clipboard: Provide a "Copy to Clipboard" button to allow users to quickly copy the entire table content to their clipboard.
- CSV Export: Offer an "Export as CSV" button to enable users to download the extracted data in CSV format for importing into other applications like ERPNext.
- Local Parsing Fallback: Incorporate a fallback mechanism that utilizes `pdf-parse` for local PDF parsing if Gemini Vision AI is unavailable.

## Style Guidelines:

- Primary color: Strong blue (#4285F4), evoking the precision of tools. 
- Background color: Light grayish blue (#E8F0FE) to provide a comfortable contrast with information-dense tabular content.
- Accent color: Light blue (#8AB4F8) for interactive elements like buttons.
- Font pairing: 'Inter' (sans-serif) for both body and headlines. Inter's clean and modern design ensures easy readability, which is especially important for tabular data.
- Employ a set of clear and intuitive icons (e.g., upload, download, copy) from a consistent icon library (e.g., Material Icons). The icon style should be simple and geometric.
- Maximize the data table's readability. Use clear column headers, consistent spacing, and subtle row highlighting on hover. The layout should be responsive to different screen sizes.
- Incorporate smooth transitions and subtle loading animations to improve user experience. For example, use a progress bar during PDF processing.