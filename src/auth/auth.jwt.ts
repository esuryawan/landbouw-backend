import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import * as activity from "ababil-activity";
import { UserSLA } from "ababil-landbouw";
import { db } from '../models/index.js';

const config = {
	secret: "ababil-asia-secret-key",
}

export function headerInit(req: Request, res: Response, next: NextFunction) {
	// console.log("headerInit");
	res.header(
		"Access-Control-Allow-Headers",
		"x-access-token, Origin, Content-Type, Accept"
	);
	next();
}

export function generateToken(id: any, name: any, session: any, expiredInSecs: number) {
	// console.log("Generate Token. user: [" + id + "|" + name + "] with session: " + session);
	var token = jwt.sign(
		{
			userid: id,
			username: name,
			session: session
		},
		config.secret,
		{ expiresIn: expiredInSecs },
	);
	return token;
};

export async function verifyToken(req: Request, res: Response, next: NextFunction) {
	// console.log("verifyToken");
	let token: string = req.headers["x-access-token"] as string;

	if (!token) {
		return activity.reply(req, res, 403, { message: "No token provided!" }, 'verifyToken', activity.Kind.Verify);
	}

	try {
		let decoded: any = jwt.verify(token, config.secret);
		console.log(`verifyToken: ${decoded.userid} - ${decoded.username}`);

		let sql = `SELECT Id, Name, Email, Kind, ExtraData FROM WebAuth_Users WHERE Id = ${decoded.userid}`;
		let users = await db.query(sql, { type: "SELECT" });
		if (users.length > 0) {
			let rec: any = users[0];
			let user: UserSLA = {
				Id: rec.Id,
				Email: rec.Email,
				UserKind: rec.Kind,
				UserName: rec.Name
			};

			var Roles = [];
			sql = `SELECT war.Id, war.Name FROM WebAuth_Roles war, WebAuth_UserRoles waur WHERE waur.UserId = ${decoded.userid} AND war.Id = waur.RoleId `;
			let roles: any[] = await db.query(sql, { type: "SELECT" });
			for (let j = 0; j < roles.length; j++) {
				Roles.push(roles[j].Name)
			}
			res.locals.Roles = Roles;

			let n = new Date();
			n.setSeconds(n.getSeconds() + Number(process.env.ExpiredInSecs));
			user.ExpiredAt = n;

			let newtoken = generateToken(decoded.userid, decoded.username, decoded.session, Number(process.env.ExpiredInSecs));
			res.setHeader('access-control-allow-origin', '*');
			res.setHeader('x-access-token', newtoken);
			res.locals.user = user;

			next();

		} else {
			return activity.reply(req, res, 401, { message: "Unauthorized!" }, 'verifyToken', activity.Kind.Verify);
		}
	} catch (error: any) {
		switch (error.name) {
			case "TokenExpiredError":
				return activity.reply(req, res, 440, { message: "Login Expired" }, 'verifyToken', activity.Kind.Verify);

			default:
				return activity.reply(req, res, 401, { message: "Unauthorized! " + error.name }, 'verifyToken', activity.Kind.Verify);
		}
	}
}

function isAllowed(access: string, req: Request, res: Response, next: NextFunction) {
	console.log(`isAllowed, access: ${access}`);
	if (res.locals.Roles.indexOf(access) >= 0) {
		console.log("user: [" + res.locals.user.Id + "|" + res.locals.user.Name + "] using role: " + access.toUpperCase());
		next();
	} else {
		activity.reply(req, res, 403, { message: "Require A " + access.toUpperCase() + " Role!", }, 'isAllowed', activity.Kind.Verify);
	}
}

export function isSuperSuper(req: Request, res: Response, next: NextFunction) {
	isAllowed("super.super", req, res, next);
}

export function isPanitiaPindai(req: Request, res: Response, next: NextFunction) {
	isAllowed("panitia.pindai", req, res, next);
}

export function isPanitiaAbsensi(req: Request, res: Response, next: NextFunction) {
	isAllowed("panitia.absensi", req, res, next);
}

export function isAdminAll(req: Request, res: Response, next: NextFunction) {
	isAllowed("admin.all", req, res, next);
}

export function isAdminAngkatan(req: Request, res: Response, next: NextFunction) {
	isAllowed("admin.angkatan", req, res, next);
}

export function isViewChart(req: Request, res: Response, next: NextFunction) {
	isAllowed("view.chart", req, res, next);
}
