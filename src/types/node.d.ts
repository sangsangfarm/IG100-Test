declare namespace NodeJS {
  interface ProcessEnv {
    /** API 로그 포함 옵션 */
    GET_LOG: 'true' | 'false';
    /** 양액 제조 딜레이 옵션 */
    FEED_MAKER_MAKE_DEALY: 'true' | 'false';
  }
}
