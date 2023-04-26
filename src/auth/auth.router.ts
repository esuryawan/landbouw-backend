import express, { Router } from "express";
import * as jwt from "./auth.jwt.js";
import * as controller from "./auth.controller.js";
import * as activity from 'ababil-activity';

export const router: Router = express.Router();

// execute on every request
router.use(activity.init);
router.use(jwt.headerInit);

// execute when method and url matched
router.post("/signin", controller.signin);
router.get("/names/:graduation/:filter", controller.getNames);
router.get("/namesall/:graduation/:filter", controller.getNamesAll);
router.get("/email/:filter", jwt.verifyToken, controller.getEmail);
router.post("/register", jwt.verifyToken, controller.register);
router.post("/attendanceCode", jwt.verifyToken, controller.attendanceCode);
router.post("/attendanceCheck", jwt.verifyToken, jwt.isPanitiaPindai, controller.attendanceCheck);
router.post("/absensi", jwt.verifyToken, jwt.isPanitiaAbsensi, controller.absensi);
router.get("/roles", jwt.verifyToken, jwt.isSuperSuper, controller.rolesList);
router.get("/roles/:id", jwt.verifyToken, jwt.isSuperSuper, controller.rolesList);
router.patch("/roleSave", jwt.verifyToken, jwt.isSuperSuper, controller.roleSave);
router.get("/alumni/:id", jwt.verifyToken, controller.getAlumni);
router.patch("/alumni/:id", jwt.verifyToken, controller.setAlumni);
router.get("/chart/registration", jwt.verifyToken, controller.chartRegistration);
router.get("/chart/presention", jwt.verifyToken, controller.chartPresention);
