import HttpException from "./exception.http";
import { Request, Response, NextFunction } from "express";

export const handlerError = (
	error: HttpException,
	request: Request,
	response: Response,
	next: NextFunction
) => {
	const status = error.statusCode || error.status || 500;

	response.status(status).send(error);
};