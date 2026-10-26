/** worker/src/errors.js —— 统一错误类型，index.js 负责映射 HTTP 状态码 */
export class ApiError extends Error {
  /**
   * @param {string} code 机器可读错误码，如 HARD_BLOCK / BAD_REQUEST / UPSTREAM / CONFIG / RATE_LIMITED
   * @param {string} message 面向用户的中文提示
   * @param {number} status HTTP 状态码
   * @param {any} extra 附加详情（可选）
   */
  constructor(code, message, status = 400, extra = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}
