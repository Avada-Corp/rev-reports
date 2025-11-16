# Инструкция по дешифровке данных на стороне клиента

## Описание
Данный документ содержит инструкцию по дешифровке зашифрованных данных на стороне клиента с использованием алгоритма AES-256-CBC.

## Код для дешифровки

```javascript
const decryptPayload = (encodedPayload) => {
  // Тот же секретный ключ, что и на сервере
  const secretKey = "default-secret-key-for-reports";
  
  // Декодируем из base64
  const encryptedPayload = Buffer.from(encodedPayload, "base64").toString();
  
  // Разделяем IV и зашифрованные данные
  const [ivHex, encryptedData] = encryptedPayload.split(":");
  
  // Преобразуем IV и ключ
  const iv = Buffer.from(ivHex, "hex");
  const key = crypto.createHash("sha256").update(secretKey).digest("base64").substr(0, 32);
  
  // Создаем дешифратор
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  
  // Дешифруем данные
  let decrypted = decipher.update(encryptedData, "hex", "utf8");
  decrypted += decipher.final("utf8");
  
  // Преобразуем JSON строку в объект
  return JSON.parse(decrypted);
};
```

## Процесс дешифровки

1. **Подготовка ключа**: Используется секретный ключ, который должен совпадать с ключом на сервере
2. **Декодирование**: Входные данные декодируются из формата base64
3. **Разделение данных**: Из декодированных данных извлекается вектор инициализации (IV) и зашифрованные данные
4. **Преобразование ключа**: Ключ хешируется с помощью SHA-256 и обрезается до нужной длины
5. **Дешифровка**: Данные дешифруются с помощью алгоритма AES-256-CBC
6. **Парсинг**: Дешифрованная строка преобразуется в объект JSON

## Требования

- Необходимо подключить модуль `crypto` в вашем проекте
- Секретный ключ должен совпадать с ключом, используемым на сервере