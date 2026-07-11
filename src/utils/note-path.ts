const WINDOWS_INVALID_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;

export function sanitizeFileStem(title: string): string {
	const sanitized = title
		.replaceAll(WINDOWS_INVALID_FILENAME_CHARS, ' ')
		.replace(/\s+/g, ' ')
		.trim();
	return sanitized === '' ? 'Untitled book' : sanitized;
}

export function makeDefaultNotePath(
	folder: string,
	title: string,
	bookId: string,
	useBookIdSuffix = false,
): string {
	const folderPrefix = normalizeFolder(folder);
	const stem = sanitizeFileStem(title);
	const suffix = useBookIdSuffix ? ` - ${sanitizeFileStem(bookId)}` : '';
	const fileName = `${stem}${suffix}.md`;
	return folderPrefix === '' ? fileName : `${folderPrefix}/${fileName}`;
}

function normalizeFolder(folder: string): string {
	return folder
		.replaceAll('\\', '/')
		.split('/')
		.map((part) => part.trim())
		.filter((part) => part !== '')
		.join('/');
}
