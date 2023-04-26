import { Sequelize } from "sequelize";
import dotenv from "dotenv";

if (!process.env.DB_NAME) {
	dotenv.config();
	console.log("Model:DB_HOST " + process.env.DB_HOST);
	console.log("Model:DB_NAME " + process.env.DB_NAME);
}

export const db = new Sequelize(process.env.DB_NAME as string, process.env.DB_USER as string, process.env.DB_PWD, {
	host: process.env.DB_HOST,
	dialect: "mysql",
	logging: false,
	pool: {
		max: 5,
		min: 0,
		acquire: 30000,
		idle: 10000,
	},
});

