import express, { Router } from 'express';
import * as jwt from "../auth/auth.jwt.js";
import * as controller from "../file/file.controller.js";



export const router: Router = express.Router();

router.post("/profile", jwt.verifyToken, controller.uploadProfile);
router.get("/list", jwt.verifyToken, controller.list);
router.get("/download/:filename", jwt.verifyToken, controller.download);
