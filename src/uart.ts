import { logger } from '@sangsangfarm/utils';
import { SerialPort, ReadlineParser } from 'serialport';

export interface UartMessageType {
  type: 'request' | 'response';
  content: Record<string, unknown>;
}

interface ParserCallback {
  (data: UartMessageType): void;
}

export default class Uart {
  private port: SerialPort;

  private parser: ReadlineParser;

  private debug: boolean;

  private parserCallback: ParserCallback;

  constructor(debug = false) {
    this.debug = debug;
    try {
      console.log('uart port 실행');
      this.port = new SerialPort({
        path: '/dev/ttyS0',
        baudRate: 115200,
      });
      console.log('uart parser 실행');
      this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
      console.log('uart parserCallback 실행');
      this.parserCallback = (data: UartMessageType) => {
        this.log('info', data);
      };
    } catch (err) {
      console.log(err);
    }

    console.log('uart port 실행2');
    this.port = new SerialPort({
      path: '/dev/ttyS0',
      baudRate: 115200,
    });
    console.log('uart parser 실행2');
    this.parser = this.port.pipe(new ReadlineParser({ delimiter: '\r\n' }));
    console.log('uart parserCallback 실행2');
    this.parserCallback = (data: UartMessageType) => {
      this.log('info', data);
    };
  }

  setParserCallback(parserCallback: ParserCallback): void {
    this.parserCallback = parserCallback;
  }

  /**
   * UART 메세지 보내기
   * @param content 메세지 내용
   * @returns
   */
  sendMessage(content: Record<string, unknown>): void {
    if (!this.port.isOpen) {
      this.log('error', 'uart port is not opened');
      return;
    }

    const payload = {
      type: 'request',
      content,
    };

    this.port.write(JSON.stringify(payload), (err) => {
      if (err) {
        this.log('error', `Error on write:  ${err.message}`);
      }
    });
  }

  /**
   * 현재 시간 UART 메세지 보내기
   */
  sendTimeMessage(): void {
    const date = new Date();
    date.getTimezoneOffset();

    this.sendMessage({
      type: 'request',
      content: {
        time: {
          year: date.getUTCFullYear(),
          month: date.getUTCMonth(),
          day: date.getUTCDate(),
          hour: date.getUTCHours(),
          min: date.getUTCMinutes(),
          sec: date.getUTCSeconds(),
        },
        timezone: date.getTimezoneOffset(),
      },
    });
  }

  /**
   * UART 실행 유무 체크
   * @returns UART 실행 유무
   */
  isRun(): boolean {
    return this.port.isOpen;
  }

  /**
   * UART 실행
   */
  run(): void {
    this.port.close();
    this.port.on('open', (err) => {
      if (err) {
        this.log('error', `Error opening port: ${err.message}`);
      }
      this.sendTimeMessage();
    });

    this.port.on('error', (err) => {
      this.log('error', `Error: ${err.message}`);
    });

    this.parser.on('data', (data: string) => {
      try {
        const uartMessage = JSON.parse(data);
        this.parserCallback(uartMessage);
      } catch {
        this.log('info', 'uart parse error');
      }
    });
  }

  /**
   * UART 로그
   *
   * @param level 로그 레벨
   * @param message 로그 메세지
   * @param useLocalLogger 로컬 로그 사용 유뮤
   * @param optionalParams 파라미터
   */
  private log(
    level: string,
    message?: unknown,
    ...optionalParams: unknown[]
  ): void {
    if (this.debug) {
      logger.log(level, message as string, ...optionalParams, {
        label: 'Uart',
      });
    }
  }
}
