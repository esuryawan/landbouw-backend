/****************************************
 * Required External Modules
 ****************************************/
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { router as routerAuth } from "./auth/auth.router.js";
import { router as routerFile } from "./file/file.router.js";
import { photoDir, photoPath, profileDir, profilePath, __dirname } from "./file/file.controller.js";
import { handlerError } from "./middleware/handle.error.js";
import { handlerErrorNotFound } from "./middleware/handle.error.not-found.js";
import { captureRequest } from "ababil-activity";

dotenv.config();

/****************************************
 * App Database
 ****************************************/


/****************************************
 * App Variables
 ****************************************/
if (!process.env.PORT) {
	process.exit(1);
}

// global.__basedir = __dirname;

/****************************************
 *  App Configuration
 ****************************************/
const app = express();

// * app.use will execute on every request

// * virtual path mapping
app.use(profilePath, express.static(profileDir));
app.use(photoPath, express.static(photoDir));

// * log request on console
app.use(captureRequest);

// * Helmet secure your Express apps by setting various HTTP headers
app.use(helmet());

// * Cross-Origin Resource Sharing configuration
var corsOptions = {
	origin: ["http://localhost:3000", "https://sla2022.com"],
	default: "http://localhost:3000",
	exposedHeaders: 'x-access-token',
};
app.use(cors(corsOptions));

// * req.body will parsed as JSON
app.use(express.json());

// * request handler with path routing
app.use("/api/auth", routerAuth);
app.use("/api/file", routerFile);

// * error handler
app.use(handlerError);
app.use(handlerErrorNotFound);


/****************************************
 * Server Activation
 ****************************************/
const PORT: number = parseInt(process.env.PORT as string, 10);
app.listen(PORT, () => {
	console.log(`Listening on port ${PORT}`);
});