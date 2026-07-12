import * as CryptoJS from 'crypto-js';

const getFa = (id: string): [string, string[]] => {
	if (/^\d*$/.test(id)) {
		const c: string[] = [];
		for (let a = 0; a < id.length; a += 9) {
			const b = id.slice(a, Math.min(a + 9, id.length));
			c.push(parseInt(b, 10).toString(16));
		}
		return ['3', c];
	}
	let d = '';
	for (let i = 0; i < id.length; i++) {
		d += id.charCodeAt(i).toString(16);
	}
	return ['4', [d]];
};

export const getPcUrl = (bookId: string): string => {
	const str = CryptoJS.MD5(bookId).toString(CryptoJS.enc.Hex);
	const fa = getFa(bookId);
	let strSub = str.slice(0, 3);
	strSub += fa[0];
	strSub += '2' + str.slice(str.length - 2, str.length);

	for (let j = 0; j < fa[1].length; j++) {
		const n = fa[1]![j]!.length.toString(16);
		if (n.length === 1) {
			strSub += '0' + n;
		} else {
			strSub += n;
		}
		strSub += fa[1][j];
		if (j < fa[1].length - 1) {
			strSub += 'g';
		}
	}

	if (strSub.length < 20) {
		strSub += str.slice(0, 20 - strSub.length);
	}

	strSub += CryptoJS.MD5(strSub).toString(CryptoJS.enc.Hex).slice(0, 3);
	const prefix = 'https://weread.qq.com/web/reader/';
	return prefix + strSub;
};
