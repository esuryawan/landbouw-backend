import { NextFunction, Request, Response } from 'express';
import util from 'util';
import fs from 'fs';
import multer from 'multer'
import path from 'path';
import * as activity from 'ababil-activity';

import { db } from '../models/index.js';


type DestinationCallback = (error: Error | null, destination: string) => void
type FileNameCallback = (error: Error | null, filename: string) => void

export const __dirname = path.resolve(path.dirname(''));
export const profileDir = `${__dirname}${process.env.PROFILE_LOCALDIR}`;
export const profilePath = `${process.env.PROFILE_URLPATH}`;
export const photoDir = `${__dirname}${process.env.PHOTO_LOCALDIR}`;
export const photoPath = `${process.env.PHOTO_URLPATH}`;
console.log('working directory 👉️', __dirname);
console.log('profile 👉️', profilePath, '-->', profileDir);
console.log('photo 👉️', photoPath, '-->', photoDir);

export async function uploadProfile(req: Request, res: Response) {
	try {
		let sql = `SELECT Id, Name, GraduationYear  FROM Alumnus WHERE UserId=${res.locals.user.Id}`;
		let recs: any[] = await db.query(sql, { type: "SELECT" });
		if (recs.length > 0) {
			let alumni: any = recs[0];
			let filename = alumni.GraduationYear + "-" + alumni.Id + "-" + alumni.Name;
			const fileStorage = multer.diskStorage({
				destination: (
					request: Request,
					file: Express.Multer.File,
					callback: DestinationCallback
				): void => {
					callback(null, profileDir);
				},

				filename: (
					req: Request,
					file: Express.Multer.File,
					callback: FileNameCallback
				): void => {
					filename = filename + path.extname(file.originalname);
					console.log(filename);
					callback(null, filename);
				}
			})

			const fileFilter = (
				request: Request,
				file: Express.Multer.File,
				callback: multer.FileFilterCallback
			): void => {
				if (
					file.mimetype === 'image/png' ||
					file.mimetype === 'image/jpg' ||
					file.mimetype === 'image/jpeg'
				) {
					callback(null, true)
				} else {
					callback(null, false)
				}
			}

			let uploadFile_ = multer({
				storage: fileStorage,
				limits: { fileSize: 10 * 1024 * 1024 },
				fileFilter: fileFilter,
			}).single("file");
			let uploadFile = util.promisify(uploadFile_);

			await uploadFile(req, res);
			if (req.file == undefined) {
				activity.reply(req, res, 400, { message: 'Please upload a file!' }, 'upload', activity.Kind.Upload);
			} else {
				sql = `UPDATE WebAuth_Users SET Picture='${filename}' WHERE Id=${res.locals.user.Id}`;
				await db.query(sql, { type: "UPDATE" });
				activity.reply(req, res, 200, { profileUrl: `${profilePath}/${filename}` }, 'upload', activity.Kind.Upload);
			}
		} else {
			activity.reply(req, res, 500, { message: 'invalid data' }, 'upload', activity.Kind.Upload);
		}
	} catch (error: any) {
		if (error.code == "LIMIT_FILE_SIZE") {
			activity.reply(req, res, 500, { message: 'File size cannot be larger than 10MB!' }, 'upload', activity.Kind.Upload);
		} else {
			activity.reply(req, res, 500, { message: `Could not upload the file: ${req.file?.originalname}. ${error}` }, 'upload', activity.Kind.Upload);
		}
	}
}


export async function download(req: Request, res: Response) {
	const fileName = req.params.name;
	res.download(photoDir + fileName, fileName, (error) => {
		if (error) {
			activity.reply(req, res, 500, { message: `Could not download the file. ${error.message}` }, 'filelist', activity.Kind.FileList);
		}
	});
}

export async function list(req: Request, res: Response) {
	fs.readdir(photoDir, function (error, files) {
		if (error) {
			activity.reply(req, res, 500, { message: error.message }, 'filelist', activity.Kind.FileList);
		} else {
			let fileInfos: any[] = [];
			files.forEach((file) => {
				fileInfos.push({
					name: file,
					url: photoPath + "/" + file,
				});
			});
			activity.reply(req, res, 200, JSON.stringify(fileInfos), 'filelist', activity.Kind.FileList);
		}
	});
}

