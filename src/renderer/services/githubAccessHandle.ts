import { Buffer } from "buffer";
import { makeRequest } from "./makeRequest";
export interface ReadFileResponse {
	name: string;
	path: string;
	sha: string;
	size: number;
	url: string;
	html_url: string;
	git_url: string;
	download_url: string;
	type: string;
	content: string;
	encoding: string;
	_links: {
		self: string;
		git: string;
		html: string;
	};
}
//TODO: locale kayıt edilip çekilecek.
const repoOwner: string = "Fanthall";
const repoName: string = "Grimnax-Chat";
const accessToken: string = "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";
const filename: string = "Sus%20Users.txt";

export const fetchGitHubData = () => {
	// GitHub deposundan veriyi çek
	return makeRequest<ReadFileResponse>({
		url: `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filename}`,
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	})
		.then((response) => {
			const content = Buffer.from(response.data.content, "base64").toString(
				"utf-8"
			);
			return content.split("\r\n").filter((item) => item !== "");
		})
		.catch((err) => {
			console.log(err);
			return [];
		});
};

export const appendGitHubData = (newData: string) => {
	// GitHub deposundaki dosyayı al
	makeRequest<ReadFileResponse>({
		url: `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filename}`,
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	})
		.then((response) => {
			// Dosyanın mevcut içeriğini al
			const currentContent = Buffer.from(
				response.data.content,
				"base64"
			).toString("utf-8");

			// Yeni içeriği dosyanın sonuna ekle
			const updatedContent = currentContent + newData + "\r\n";

			// Yeni içeriği base64'e dönüştür
			const encodedContent = Buffer.from(updatedContent).toString("base64");

			// GitHub deposundaki dosyayı güncelle
			makeRequest({
				url: `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filename}`,
				data: {
					message: "Dosya güncellendi",
					content: encodedContent,
					sha: response.data.sha,
				},
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				method: "PUT",
			});
		})
		.catch((err) => {
			console.log(err);
		});
};

export const removeGitHubData = (oldData: string) => {
	// GitHub deposundaki dosyayı al
	makeRequest<ReadFileResponse>({
		url: `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filename}`,
		method: "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	})
		.then((response) => {
			// Dosyanın mevcut içeriğini al
			const currentContent = Buffer.from(
				response.data.content,
				"base64"
			).toString("utf-8");

			// Yeni içeriği dosyanın sonuna ekle
			const updatedContent = currentContent
				.split("\r\n")
				.filter((item) => item !== "" && item !== oldData)
				.join("\n");

			// Yeni içeriği base64'e dönüştür
			const encodedContent = Buffer.from(updatedContent).toString("base64");

			// GitHub deposundaki dosyayı güncelle
			makeRequest({
				url: `https://api.github.com/repos/${repoOwner}/${repoName}/contents/${filename}`,
				data: {
					message: "Dosya güncellendi",
					content: encodedContent,
					sha: response.data.sha,
				},
				headers: {
					Authorization: `Bearer ${accessToken}`,
				},
				method: "PUT",
			});
		})
		.catch((err) => {
			console.log(err);
		});
};
