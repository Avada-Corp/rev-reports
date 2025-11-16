import { INestApplication } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";

export function logRequests(app: INestApplication) {
  // Получаем HttpService из приложения
  const httpService = app.get(HttpService);

  // Добавляем interceptor для исходящих запросов
  httpService.axiosRef.interceptors.request.use(
    (config) => {
      console.info(`HTTP >>out>>>>: ${config.url} | Method: ${config.method?.toUpperCase()}`);
      return config;
    },
    (error) => {
      console.error("Error in outgoing request:", error);
      return Promise.reject(error);
    }
  );

  // Существующее логирование входящих запросов
  app.use((req, res, next) => {
    console.info(`<<<in<<<< HTTP: ${req.url} | Method: ${req.method}`);
    next();
  });
}
