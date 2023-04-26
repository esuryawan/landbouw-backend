import { NextFunction, Request, Response } from 'express';
import { OAuth2Client } from "google-auth-library";
import { existsSync } from 'fs';

import * as utils from 'ababil-utils';
import * as activity from 'ababil-activity';
import { grupIndex, UserSLA } from 'ababil-landbouw';

import { db } from '../models/index.js';
import { profileDir, profilePath } from '../file/file.controller.js';
import { generateToken } from './auth.jwt.js';
import { ColourCodes, GrupColourCodes, GrupNames, ResponseCode } from '../constants.js';

const googleClient = new OAuth2Client({
	clientId: `${process.env.GOOGLE_CLIENT_ID}`,
});

// const profileUrl = `${process.env.PROFILE_URLPATH}`;
// const profileLocal = `${process.env.PROFILE_LOCALDIR}`;

export async function signin(req: Request, res: Response) {
	console.log("debug.1");
	try {
		/************************************************
						  Validate CSRF
		*************************************************/
		/*
		csrf_token_cookie = self.request.cookies.get('g_csrf_token')
		if not csrf_token_cookie:
			webapp2.abort(400, 'No CSRF token in Cookie.')
		csrf_token_body = self.request.get('g_csrf_token')
		if not csrf_token_body:
			webapp2.abort(400, 'No CSRF token in post body.')
		if csrf_token_cookie != csrf_token_body:
			webapp2.abort(400, 'Failed to verify double submit cookie.')
		*/

		/************************************************
					 Validate Google JWT Token
		************************************************/
		let envelop!: any;
		let payLoad!: any;
		const googleJwt = req.body;
		// const credentials = googleJwt.credential.split(".");
		// envelop = JSON.parse(Buffer.from(credentials[0], 'base64').toString('ascii'));
		// payLoad = JSON.parse(Buffer.from(credentials[1], 'base64').toString('ascii'));
		// unverified credentials[2]

		const ticket = await googleClient.verifyIdToken({
			idToken: googleJwt.credential,
			audience: `${process.env.GOOGLE_CLIENT_ID}`,
		});
		envelop = ticket.getEnvelope();
		payLoad = ticket.getPayload();

		// console.log("googleJwt", googleJwt);
		// console.log("header", envelop);
		// console.log("payLoad", payLoad);

		/** 
		envelop:
		{
			alg: 'RS256', 
			kid: 'b1a8259eb07660ef23781c85b7849bfa0a1c806c', 
			typ: 'JWT'
		}
		payload:
		{
			"iss": "https://accounts.google.com",
			"nbf": 1652523563,
			"aud": "1058359876929-6esuhjomsh3dlk2ncf6cjju004rs95fl.apps.googleusercontent.com",
			"sub": "110449083244930967638",
			"email": "erick.suryawan@gmail.com",
			"email_verified": true,
			"azp": "1058359876929-6esuhjomsh3dlk2ncf6cjju004rs95fl.apps.googleusercontent.com",
			"name": "Erick Suryawan",
			"picture": "https://lh3.googleusercontent.com/a-/AOh14GhsyKuGjQkV89GsGUqvIeQgv1su6JGAYf3HHUbaOA=s96-c",
			"given_name": "Erick",
			"family_name": "Suryawan",
			"iat": 1652523863,
			"exp": 1652527463,
			"jti": "3d4bd5fdd98f139aae5ce694ca868a5f835e7118"
		} 
		*/

		let result!: UserSLA;
		let sql = `SELECT Id, Name, Email, Kind, Picture, ExtraData FROM WebAuth_Users WHERE Email = '${payLoad.email}'`;
		let users = await db.query(sql, { type: "SELECT" });
		if (users.length > 0) {
			console.log("signin", payLoad.name, payLoad.email);
			let user: any = users[0];
			result = {
				Id: user.Id,
				UserName: user.Name,
				UserKind: user.Kind,
				Email: user.Email,
				Picture: user.Picture,
			}
			sql = `SELECT Id, Name, GraduationYear, NIS, Classes, Status, UserId, Alias, Title, BirthDate, DateOfDeath, Addresses, Phones, Business, ExtraData FROM Alumnus WHERE UserId = ${result.Id}`;
			let alumnus: any = await db.query(sql, { type: "SELECT" });
			if (alumnus.length > 0) {
				result.Alumni = alumnus[0];
			} else {
				sql = `SELECT Id, Name, GraduationYear FROM Alumnus WHERE UserId IS NULL AND DateOfDeath IS NULL AND Name LIKE '${result.UserName}%'`;
				alumnus = await db.query(sql, { type: "SELECT" });
				console.log('suggests', alumnus);
				if (alumnus.length > 0) {
					result.suggests = alumnus;
				}
			}
		} else if ((payLoad.email) && (payLoad.email_verified)) {
			console.log("signin.new", payLoad.name, payLoad.email);
			let xd = JSON.stringify(payLoad).replace(/\'/g, "\\'");
			sql = `INSERT INTO WebAuth_Users (Name, Password, Email, Kind, ExtraData) VALUES('${payLoad.name}', NULL ,'${payLoad.email}', 0, '${xd}')`;
			let newrec = await db.query(sql, { type: "INSERT" });
			result = {
				Id: Number(newrec[0]),
				UserName: payLoad.name,
				Email: payLoad.email,
				UserKind: 0,
			}

			sql = `SELECT Id, Name, GraduationYear FROM Alumnus WHERE UserId IS NULL AND DateOfDeath IS NULL AND Name LIKE '${result.UserName}%'`;
			let alumnus: any = await db.query(sql, { type: "SELECT" });
			console.log('suggests', alumnus);
			if (alumnus.length > 0) {
				result.suggests = alumnus;
			}
		} else {
			activity.reply(req, res, 500, { message: 'invalid login data' }, 'signin', activity.Kind.Verify);
		}

		if (result) {
			result.Roles = [];
			sql = `SELECT war.Name  FROM WebAuth_UserRoles waur, WebAuth_Roles war WHERE waur.UserId = ${result.Id} AND waur.RoleId = war.Id`;
			let roles: any[] = await db.query(sql, { type: "SELECT" });
			for (let i = 0; i < roles.length; i++) {
				result.Roles.push(roles[i].Name.toLowerCase());
			}
			if (!result.Picture) {
				result.Picture = profilePath + "/default.png";
				if (result.Alumni?.NIS) {
					let fname = result.Alumni.GraduationYear + "/" + `${result.Alumni?.NIS}.jpg`.padStart(5 + 4, '0');
					let localPath = `${profileDir}/${fname}`;
					console.log("fname", localPath);
					if (existsSync(localPath)) {
						result.Picture = `${profilePath}/${fname}`;
					}
					console.log("result.Picture", result.Picture);
				}
			} else {
				result.Picture = profilePath + "/" + result.Picture;
			}
			let n = new Date();
			n.setSeconds(n.getSeconds() + Number(process.env.ExpiredInSecs));
			result.ExpiredAt = n;
			result.AccessToken = generateToken(result.Id, payLoad.name, payLoad.jti, Number(process.env.ExpiredInSecs));

			activity.reply(req, res, 200, result, 'signin', activity.Kind.Verify);
		}
	} catch (error: any) {
		console.log(error);
		activity.reply(req, res, 500, { message: error.message }, 'signin', activity.Kind.Verify);
	}
};

export async function getNames(req: Request, res: Response) {
	try {
		if (req.params.filter == '') {
			activity.reply(req, res, 500, { message: 'empty filter' }, 'getNames', activity.Kind.List);
		} else {
			let constraint = ` FROM Alumnus WHERE UserId IS NULL AND DateOfDeath IS NULL AND GraduationYear = ${req.params.graduation} AND Name LIKE '${req.params.filter}%'`;

			let counts: any = await db.query("SELECT count(*) as count " + constraint, { type: "SELECT" });
			let rows = await db.query("SELECT Id, Name" + constraint + " LIMIT 19", { type: "SELECT" });


			let result = {
				count: counts[0].count,
				rows: rows,
			};
			// console.log(result)
			activity.reply(req, res, 200, JSON.stringify(result), 'getNames', activity.Kind.List);
		}
	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'getNames', activity.Kind.List);
	}
}

export async function getNamesAll(req: Request, res: Response) {
	try {
		if (req.params.filter == '') {
			activity.reply(req, res, 500, { message: 'empty filter' }, 'getNamesAll', activity.Kind.List);
		} else {
			let constraint = ` FROM Alumnus WHERE GraduationYear = ${req.params.graduation} AND Name LIKE '${req.params.filter}%'`;

			let counts: any = await db.query("SELECT count(*) as count " + constraint, { type: "SELECT" });
			let rows = await db.query("SELECT Id, Name" + constraint + " LIMIT 19", { type: "SELECT" });


			let result = {
				count: counts[0].count,
				rows: rows,
			};
			// console.log(result)
			activity.reply(req, res, 200, JSON.stringify(result), 'getNamesAll', activity.Kind.List);
		}
	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'getNamesAll', activity.Kind.List);
	}
}

export async function getEmail(req: Request, res: Response) {
	try {
		if (req.params.filter == '') {
			activity.reply(req, res, 500, { message: 'empty filter' }, 'getEmail', activity.Kind.List);
		} else {
			let constraint = ` FROM WebAuth_Users WHERE Email LIKE '%${req.params.filter}%'`;

			let counts: any = await db.query("SELECT count(*) as count " + constraint, { type: "SELECT" });
			let rows = await db.query("SELECT Id, Name, Email" + constraint + " LIMIT 19", { type: "SELECT" });


			let result = {
				count: counts[0].count,
				rows: rows,
			};
			activity.reply(req, res, 200, JSON.stringify(result), 'getEmail', activity.Kind.List);
		}
	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'getEmail', activity.Kind.List);
	}
}

export async function register(req: Request, res: Response) {
	console.log("register");
	try {
		let data = req.body;
		let userId = data.Id;
		let name = data.Name.replace(/\'/g, "\\'");
		let alumnusId = data.AlumnusId;
		let graduation = data.GraduationYear;

		let sql = `SELECT Id, Name, GraduationYear FROM Alumnus WHERE UserId = ${userId}`;
		let rs: any = await db.query(sql, { type: "SELECT" });
		if (rs.length == 0) {

			let xd = `{"History": {"${utils.getLocalTime()} ": {"Action": "Link", "By": "Google Sign-In", "ActivityId": "register", "OriginalId": ${alumnusId}}}}`;
			sql = `UPDATE Alumnus SET UserId=${userId}, ExtraData='${xd}' WHERE UPPER(Name)=UPPER('${name}') AND GraduationYear=${graduation} AND Id=${alumnusId}`;
			rs = await db.query(sql, { type: "UPDATE" });
			const [recs, count] = rs;
			if (count === 0) {
				xd = `{"History": {"${utils.getLocalTime()} ": {"Action": "Create", "By": "Google Sign-In", "ActivityId": "register", "OriginalId": ${alumnusId}}}}`;
				sql = `INSERT INTO Alumnus(Name, GraduationYear, UserId, ExtraData)VALUES('${name}', ${graduation}, ${userId} ,'${xd}');`
				await db.query(sql, { type: "INSERT" });
			}

			let user: UserSLA;
			sql = `SELECT Id, Name, Email, Kind, Picture, ExtraData FROM WebAuth_Users WHERE Id = '${userId}'`;
			let users = await db.query(sql, { type: "SELECT" });
			if (users.length > 0) {
				user = users[0] as unknown as UserSLA;
				sql = `SELECT * FROM Alumnus WHERE UserId = ${userId}`;
				let alumnus: any = await db.query(sql, { type: "SELECT" });
				if (alumnus.length > 0) {
					user.Alumni = alumnus[0];
				}
				if (!user.Picture) {
					user.Picture = profilePath + "/default.png";
				} else {
					user.Picture = profilePath + "/" + user.Picture;
				}
				activity.reply(req, res, 200, JSON.stringify(user), 'registration', activity.Kind.Create);
			} else {
				activity.reply(req, res, 500, { message: "user unknown" }, 'registration', activity.Kind.Create);
			}
		} else {
			activity.reply(req, res, 500, { message: "user already registered" }, 'registration', activity.Kind.Create);
		}
	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'registration', activity.Kind.Create);
	}
}

export const attendanceCode = async function getCode(req: Request, res: Response) {
	console.log("attendanceCode");
	try {
		let result = {
			status: ResponseCode.Unknown,
			code: '',
			attendanceAt: ''
		};

		// get alumni by user
		let sql = `SELECT Id FROM Alumnus WHERE UserId = ${res.locals.user.Id}`
		let recs: any[] = await db.query(sql, { type: "SELECT" });
		if (recs.length > 0) {
			let alumnusId = recs[0].Id;

			let n = new Date();
			let d = utils.dataToYYYY_MM_DD(n);

			// check previous generated record
			// sql = `SELECT Id, Tanggal, AlumniId, Code, ExpireAt, AttendanceAt, VerifiedBy, VerificationMode	FROM Absensi WHERE AlumniId = ${alumnusId} AND Tanggal = '${d}'`
			sql = `SELECT Id, Tanggal, AlumniId, Code, ExpireAt, AttendanceAt, VerifiedBy, VerificationMode	FROM Absensi WHERE AlumniId = ${alumnusId}`
			recs = await db.query(sql, { type: "SELECT" });
			if (recs.length > 0) {
				let rec = recs[0];
				if (!rec.AttendanceAt) {
					sql = `DELETE FROM Absensi WHERE Id=${rec.Id}`
					await db.query(sql, { type: "DELETE" });
				} else {
					result.status = ResponseCode.AlreadyAttend
					result.attendanceAt = `${rec.Tanggal} ${rec.AttendanceAt}`;
				}
			}

			if (result.status === ResponseCode.Unknown) {
				// create new record
				let r = utils.makeRandom();
				n.setMinutes(n.getMinutes() + 1); // expired after 60 seconds
				// n.setHours(n.getHours() + 6); // expired after 6 hours
				let e = utils.dateToHH_MI_SS(n);
				sql = `INSERT INTO Absensi(Tanggal, AlumniId, Code, ExpireAt) VALUES('${d}', ${alumnusId}, '${r}', '${e}')`;
				recs = await db.query(sql, { type: "INSERT" });
				const [newid, count] = recs;

				result.status = ResponseCode.Success;
				result.code = `${newid}-${r}-${alumnusId}`;
			}

			activity.reply(req, res, 200, JSON.stringify(result), 'attendanceCode', activity.Kind.Create);
		} else {
			activity.reply(req, res, 404, { message: "user is not alumni" }, 'attendanceCode', activity.Kind.Create);
		}

	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'attendanceCode', activity.Kind.Create);
	}
}

export async function attendanceCheck(req: Request, res: Response) {
	console.log("attendanceCheck");
	try {
		let result = {
			Status: ResponseCode.Unknown,
			Name: '',
			GraduationYear: 0,
			attendanceAt: ''
		};

		let data = req.body;
		let panitiaId = data.Id;
		let [attendanceId, random, alumnusId] = data.Code.split("-");

		// get absen by alumni
		let sql = `SELECT Tanggal, AlumniId, Code, ExpireAt, AttendanceAt, VerifiedBy, VerificationMode	FROM Absensi WHERE Id=${attendanceId}`;
		let recs = await db.query(sql, { type: "SELECT" });
		if (recs.length > 0) {
			let rec: any = recs[0];
			if (rec.AlumniId == alumnusId) {
				if (rec.Code == random) {
					if (!rec.AttendanceAt) {
						let s = rec.Tanggal.toString() + 'T' + rec.ExpireAt.toString()
						let exp = new Date(s);
						let now = new Date();
						if (now <= exp) {
							sql = `UPDATE Absensi SET AttendanceAt='${utils.dateToHH_MI_SS(now)}', VerifiedBy=${panitiaId}, VerificationMode=${1}	WHERE Id=${attendanceId}`;
							await db.query(sql, { type: "UPDATE" });
							sql = `SELECT Name, GraduationYear, Alias FROM Alumnus WHERE Id=${alumnusId}`;
							let recs: any[] = await db.query(sql, { type: "SELECT" });
							if (recs.length > 0) {
								result.Name = recs[0].Name;
								result.GraduationYear = recs[0].GraduationYear;
								result.Status = ResponseCode.Success;
							} else {
								result.Status = ResponseCode.InvalidData; // invalid alumnus data
							}
						} else {
							result.Status = ResponseCode.CodeExpired;
							console.log(result.Status + ": expired", exp)
						}
					} else {
						result.Status = ResponseCode.AlreadyAttend;
						result.attendanceAt = `${rec.Tanggal} ${rec.AttendanceAt}`;
						console.log(result.Status + ": sudah absen", rec.AttendanceAt)
					}
				} else {
					result.Status = ResponseCode.RandomNotMatch;
					console.log(result.Status + ": random not match", rec.Code, random)
				}
			} else {
				result.Status = ResponseCode.AlumniNotMatch;
				console.log(result.Status + ": alumnus Id not match", rec.AlumniId, alumnusId)
			}
		} else {
			result.Status = ResponseCode.RecordNotFound;
			console.log(result.Status + ": absensi not found", attendanceId)
		}
		activity.reply(req, res, 200, JSON.stringify(result), 'attendanceCheck', activity.Kind.Approval);
	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'attendanceCheck', activity.Kind.Approval);
	}
}

export async function isAlumniSelf(req: Request, res: Response, next: NextFunction) {
	let alumniId = req.params.id;
	let userId = res.locals.user.Id;
	let sql = `SELECT Id FROM Alumnus WHERE UserId=${userId}`;
	let recs: any[] = await db.query(sql, { type: "SELECT" });
	if (recs.length > 0 && recs[0].Id === alumniId) {
		next()
	} else {
		return activity.reply(req, res, 401, { message: "Unauthorized!" }, 'isAlumniSelf', activity.Kind.Verify);
	}
}

export async function getAlumni(req: Request, res: Response) {
	try {
		let sql = `SELECT * FROM Alumnus WHERE Id = ${req.params.id}`;
		let rows: any[] = await db.query(sql, { type: "SELECT" });
		if (rows.length > 0) {
			let result = rows[0];
			if (result.UserId === res.locals.user.Id ||
				res.locals.Roles.indexOf("admin.all") >= 0
				// (res.locals.Roles.indexOf("admin.angkatan") >= 0 && isAngkatan(res.locals.user.Id, result.GraduationYear))
			) {
				activity.reply(req, res, 200, JSON.stringify(result), 'getAlumni', activity.Kind.Query);
			} else {
				// isAngkatan is premise mode, we check directly here
				sql = `SELECT GraduationYear FROM Alumnus WHERE UserId = ${res.locals.user.Id}`;
				rows = await db.query(sql, { type: "SELECT" });
				if (rows.length > 0 && rows[0].GraduationYear === result.GraduationYear) {
					activity.reply(req, res, 200, JSON.stringify(result), 'getAlumni', activity.Kind.Query);
				} else {
					activity.reply(req, res, 401, { message: "not allowed" }, 'getAlumni', activity.Kind.Query);
				}
			}
		} else {
			activity.reply(req, res, 401, { message: "not allowed" }, 'getAlumni', activity.Kind.Query);
		}
	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'getAlumni', activity.Kind.Query);
	}
}

export async function setAlumni(req: Request, res: Response) {
	try {
		let sql = `SELECT UserId FROM Alumnus WHERE Id = ${req.params.id}`;
		let rows: any[] = await db.query(sql, { type: "SELECT" });
		if (rows.length > 0) {
			let result = rows[0];
			if (result.UserId === res.locals.user.Id ||
				res.locals.Roles.indexOf("admin.all") >= 0
			) {
				await updateAlumni();
			} else {
				// isAngkatan is premise mode, we check directly here
				sql = `SELECT GraduationYear FROM Alumnus WHERE UserId = ${res.locals.user.Id}`;
				rows = await db.query(sql, { type: "SELECT" });
				if (rows.length > 0 && rows[0].GraduationYear === result.GraduationYear) {
					await updateAlumni();
				} else {
					activity.reply(req, res, 401, { message: "not allowed" }, 'setAlumni', activity.Kind.Update);
				}

			}
		} else {
			activity.reply(req, res, 401, { message: "not found" }, 'setAlumni', activity.Kind.Update);
		}
	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'setAlumni', activity.Kind.List);
	}

	async function updateAlumni() {
		console.log(req.params.id, req.body);
		let changes = req.body;
		const keys = Object.keys(changes);
		if (keys.length > 0) {
			let sets = `${keys[0]}='${changes[keys[0]]}'`;
			for (let i = 1; i < keys.length; i++) {
				sets = `${sets}, ${keys[i]}='${changes[keys[i]]}'`;
			}
			let dataEscaped = JSON.stringify(req.body).replace(/\'/g, "\\'");
			let sql = `UPDATE Alumnus SET ${sets}`
				+ ", ExtraData=JSON_SET(ExtraData,'$.\"History\".\"" + utils.getLocalTime() + "\"', JSON_OBJECT('Action','Update','By', '" + res.locals.user.Name + "','Data','" + dataEscaped + "'))"
				+ `WHERE Id=${req.params.id}`
			await db.query(sql, { type: "UPDATE" });
		}
		activity.reply(req, res, 200, {}, 'setAlumni', activity.Kind.List);
	}
}

export async function absensi(req: Request, res: Response) {
	console.log("absensi");
	try {
		let result = {
			status: ResponseCode.Unknown,
			name: '',
			graduationYear: 0,
			attendanceAt: ''
		};

		let n = new Date();
		let d = utils.dataToYYYY_MM_DD(n);

		// get alumni
		let alumnusId = req.body.AlumnusId;
		let sql = "";
		if (alumnusId > 0)
			sql = `SELECT Id, Name, GraduationYear FROM Alumnus WHERE Id = ${alumnusId}`
		else
			sql = `SELECT Id, Name, GraduationYear FROM Alumnus WHERE UPPER(Name)=UPPER('${req.body.Name}') AND GraduationYear=${req.body.GraduationYear}`

		let recs: any[] = await db.query(sql, { type: "SELECT" });
		if (recs.length > 0) {
			alumnusId = recs[0].Id;
			result.name = recs[0].Name;
			result.graduationYear = recs[0].GraduationYear;

			// check previous generated record
			// sql = `SELECT Id, Tanggal, AlumniId, Code, ExpireAt, AttendanceAt, VerifiedBy, VerificationMode	FROM Absensi WHERE AlumniId = ${alumnusId} AND Tanggal = '${d}'`
			sql = `SELECT Id, Tanggal, AlumniId, Code, ExpireAt, AttendanceAt, VerifiedBy, VerificationMode	FROM Absensi WHERE AlumniId = ${alumnusId}`
			recs = await db.query(sql, { type: "SELECT" });
			if (recs.length > 0) {
				let rec = recs[0];
				if (!rec.AttendanceAt) {
					sql = `DELETE FROM Absensi WHERE Id=${rec.Id}`
					await db.query(sql, { type: "DELETE" });
				} else {
					result.status = ResponseCode.AlreadyAttend
					result.attendanceAt = `${rec.Tanggal} ${rec.AttendanceAt}`;
				}
			}

		} else {
			// data alumni tidak ada, catat baru
			result.name = req.body.Name;
			result.graduationYear = req.body.GraduationYear;
			let xd = `{"History": {"${utils.getLocalTime()} ": {"Action": "Create", "By": "Absensi Manual", "ActivityId": "absensi", "OriginalId": 0 }}}`;
			sql = `INSERT INTO Alumnus(Name, GraduationYear, ExtraData)VALUES('${result.name}', ${result.graduationYear}, '${xd}');`
			recs = await db.query(sql, { type: "INSERT" });
			alumnusId = recs[0];
		}

		if (result.status === ResponseCode.Unknown) {
			// create new record
			let r = utils.makeRandom();
			let at = utils.dateToHH_MI_SS(n);
			n.setMinutes(n.getMinutes() + 1); // expired after 60 seconds
			let e = utils.dateToHH_MI_SS(n);
			sql = `INSERT INTO Absensi(Tanggal, AlumniId, Code, ExpireAt, AttendanceAt, VerifiedBy, VerificationMode) VALUES('${d}', ${alumnusId}, '${r}', '${e}', '${at}', ${res.locals.user.Id}, ${2})`;
			recs = await db.query(sql, { type: "INSERT" });
			result.status = ResponseCode.Success;
			result.attendanceAt = at;
		}
		activity.reply(req, res, 200, JSON.stringify(result), 'absensi', activity.Kind.Create);

	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'absensi', activity.Kind.Create);
	}
}

export async function rolesList(req: Request, res: Response) {
	try {

		let sql: string;
		let rows: any[]
		let resultCount: number;

		if (req.params.id) {
			resultCount = 1;
			sql = `SELECT DISTINCT UserId, Name, Email FROM WebAuth_Users wau, WebAuth_UserRoles waur WHERE wau.Id = waur.UserId AND waur.UserId=${req.params.id}`
		} else {
			sql = `SELECT UserId, COUNT(*) AS  C FROM WebAuth_UserRoles GROUP BY UserId`
			rows = await db.query(sql, { type: "SELECT" });
			resultCount = rows.length;

			const { p, s } = req.query;
			sql = `SELECT DISTINCT UserId, Name, Email FROM WebAuth_Users wau, WebAuth_UserRoles waur WHERE wau.Id = waur.UserId ORDER BY Name LIMIT ${Number(p) * Number(s)}, ${s}`
		}

		let resultRows: any[] = [];

		let users = await db.query(sql, { type: "SELECT" });
		for (let i = 0; i < users.length; i++) {
			let user: any = users[i];
			sql = `SELECT war.Name FROM WebAuth_UserRoles waur, WebAuth_Roles war WHERE war.Id > 10000 AND waur.RoleId = war.Id AND waur.UserId = ${user.UserId} ORDER BY war.id`
			let roles: any[] = await db.query(sql, { type: "SELECT" });
			let itemRoles: any[] = [];
			for (let i = 0; i < roles.length; i++) {
				itemRoles.push(roles[i].Name);
			}
			resultRows.push({ UserId: user.UserId, Name: user.Name, Email: user.Email, Roles: itemRoles });
		}

		const result = {
			count: resultCount,
			rows: resultRows
		}
		activity.reply(req, res, 200, JSON.stringify(result), 'rolesList', activity.Kind.List);
	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'rolesList', activity.Kind.List);
	}
}

export async function roleSave(req: Request, res: Response) {
	try {
		let sql = `DELETE FROM WebAuth_UserRoles WHERE RoleId > 10000 AND UserId=${req.body.UserId}`;
		await db.query(sql, { type: "DELETE" });
		if (req.body.Roles.length > 0) {
			let sroles = `"${req.body.Roles[0]}"`;
			for (let i = 1; i < req.body.Roles.length; i++) {
				if (req.body.Roles[i] != 'super.super')
					sroles = `${sroles}, "${req.body.Roles[i]}"`;
			}
			sql = `INSERT INTO WebAuth_UserRoles(RoleId, UserId) SELECT war.Id, ${req.body.UserId} FROM WebAuth_Roles war WHERE war.Id > 10000 AND war.Name in (${sroles})`
			await db.query(sql, { type: "INSERT" });
		}
		activity.reply(req, res, 200, {}, 'setAlumni', activity.Kind.List);
	}
	catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'setAlumni', activity.Kind.List);
	}
}

export async function chartRegistration(req: Request, res: Response) {
	try {
		let sql = `SELECT GraduationYear, COUNT(*) AS Jumlah  FROM Alumnus WHERE UserId > 0 GROUP BY GraduationYear ORDER BY COUNT(*)  DESC`
		let regs: any[] = await db.query(sql, { type: "SELECT" });
		let alabels: string[] = [];
		let acolors: string[] = [];
		let avalues: number[] = [];
		let gtemp: any[] = [
			{ idx: 0, value: 0 },
			{ idx: 1, value: 0 },
			{ idx: 2, value: 0 },
			{ idx: 3, value: 0 },
			{ idx: 4, value: 0 },
			{ idx: 5, value: 0 },
			{ idx: 6, value: 0 },
			{ idx: 7, value: 0 },
			{ idx: 8, value: 0 },
			{ idx: 9, value: 0 },
			{ idx: 10, value: 0 },
			{ idx: 11, value: 0 }];
		let total = 0;
		for (let i = 0; i < regs.length; i++) {
			let g = grupIndex(regs[i].GraduationYear);
			gtemp[g].value = gtemp[g].value + regs[i].Jumlah
			total = total + regs[i].Jumlah;
			if (i < 9) {
				avalues.push(regs[i].Jumlah)
				acolors.push(ColourCodes[regs[i].GraduationYear - 1959 + 1])
				alabels.push(regs[i].GraduationYear + ":" + avalues[i]);
			} else if (i === 9) {
				avalues.push(regs[i].Jumlah)
				acolors.push(ColourCodes[regs[i].GraduationYear - 1959 + 1])
				alabels.push("lainnya:" + avalues[i]);
			} else {
				avalues[9] = avalues[9] + regs[i].Jumlah;
				acolors[9] = ColourCodes[0];
				alabels[9] = "lainnya:" + avalues[9];
			}
		}
		let glabels: string[] = [];
		let gcolors: string[] = [];
		let gvalues: number[] = [];
		gtemp.sort(function (a, b) { return b.value - a.value });
		for (let i = 0; i < gtemp.length; i++) {
			const g = gtemp[i].idx;
			gvalues.push(gtemp[i].value);
			glabels.push(GrupNames[g] + ":" + gvalues[i]);
			gcolors.push(GrupColourCodes[g]);
		}

		activity.reply(req, res, 200, JSON.stringify({
			total: total,
			alabels: alabels, avalues: avalues, acolors: acolors,
			glabels: glabels, gvalues: gvalues, gcolors: gcolors
		}), 'chartRegistration', activity.Kind.List);

	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'chartRegistration', activity.Kind.List);
	}

}

export async function chartPresention(req: Request, res: Response) {
	try {
		let n = new Date();
		// let tgl = utils.dataToYYYY_MM_DD(n);
		// let sql = `SELECT al.GraduationYear, COUNT(*) AS Jumlah FROM Absensi ab, Alumnus al WHERE NOT ISNULL(AttendanceAt) AND ab.AlumniId = al.Id AND ab.Tanggal='${tgl}' GROUP BY al.GraduationYear ORDER BY COUNT(*)  DESC`
		let sql = `SELECT al.GraduationYear, COUNT(*) AS Jumlah FROM Alumnus al, 
						( SELECT DISTINCT AlumniId FROM Absensi ab WHERE NOT ISNULL(ab.AttendanceAt)) AS ab
					WHERE ab.AlumniId = al.Id GROUP BY al.GraduationYear ORDER BY COUNT(*)  DESC`
		let regs: any[] = await db.query(sql, { type: "SELECT" });
		let alabels: string[] = [];
		let acolors: string[] = [];
		let avalues: number[] = [];
		let gtemp: any[] = [
			{ idx: 0, value: 0 },
			{ idx: 1, value: 0 },
			{ idx: 2, value: 0 },
			{ idx: 3, value: 0 },
			{ idx: 4, value: 0 },
			{ idx: 5, value: 0 },
			{ idx: 6, value: 0 },
			{ idx: 7, value: 0 },
			{ idx: 8, value: 0 },
			{ idx: 9, value: 0 },
			{ idx: 10, value: 0 },
			{ idx: 11, value: 0 }];
		let total = 0;
		for (let i = 0; i < regs.length; i++) {
			let g = grupIndex(regs[i].GraduationYear);
			gtemp[g].value = gtemp[g].value + regs[i].Jumlah
			total = total + regs[i].Jumlah;
			if (i < 9) {
				avalues.push(regs[i].Jumlah)
				acolors.push(ColourCodes[regs[i].GraduationYear - 1959 + 1])
				alabels.push(regs[i].GraduationYear + ":" + avalues[i]);
			} else if (i === 9) {
				avalues.push(regs[i].Jumlah)
				acolors.push(ColourCodes[regs[i].GraduationYear - 1959 + 1])
				alabels.push("lainnya:" + avalues[i]);
			} else {
				avalues[9] = avalues[9] + regs[i].Jumlah;
				acolors[9] = ColourCodes[0];
				alabels[9] = "lainnya:" + avalues[9];
			}
		}
		let glabels: string[] = [];
		let gcolors: string[] = [];
		let gvalues: number[] = [];
		gtemp.sort(function (a, b) { return b.value - a.value });
		for (let i = 0; i < gtemp.length; i++) {
			const g = gtemp[i].idx;
			gvalues.push(gtemp[i].value);
			glabels.push(GrupNames[g] + ":" + gvalues[i]);
			gcolors.push(GrupColourCodes[g]);
		}

		activity.reply(req, res, 200, JSON.stringify({
			total: total,
			alabels: alabels, avalues: avalues, acolors: acolors,
			glabels: glabels, gvalues: gvalues, gcolors: gcolors
		}), 'chartPresention', activity.Kind.List);

	} catch (error: any) {
		activity.reply(req, res, 500, { message: error.message }, 'chartPresention', activity.Kind.List);
	}
}
