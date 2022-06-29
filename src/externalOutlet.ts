import { DeviceTwin, DeviceTwinState } from '@sangsangfarm/types';
import { isEmpty, localLogger, logger } from '@sangsangfarm/utils';
import { ModuleClient, Message } from 'azure-iot-device';
import Uart, { UartMessageType } from './uart';

interface ExternalOutletInfo {
  /** 콘센트 이름 */
  name: string;
  /** 전원 상태 */
  power: boolean;
  /** 디머 (10 ~ 100) */
  dimmer: number;
  /** 콘센트 타입 */
  type: string;
  /** 타이머 기능 사용 유무 */
  timer: boolean;
  /** 타이머 작동 시작 시간 (0 ~ 1439 : 0 - 0:00, 1439 - 23:59) */
  startTime: number;
  /** 타이머 작동 종료 시간 (0 ~ 1439 : 0 - 0:00, 1439 - 23:59) */
  endTime: number;
  /** 콘센트 켜지는 주기 */
  timerInterval: number;
  /** 콘센트 꺼지는 주기 */
  onOffInterval: number;
  /** 최근 켜진 시간 : (unix timestamp) */
  lastTimeTurnOn: number;
}

type ExternalOutletInfoKey =
  | 'name'
  | 'power'
  | 'dimmer'
  | 'type'
  | 'timer'
  | 'startTime'
  | 'endTime'
  | 'timerInterval'
  | 'onOffInterval'
  | 'lastTimeTurnOn';

/**
 * 외부 콘센트 트윈 정보
 */
interface ExternalOutletTwinProperty {
  [index: number]: ExternalOutletInfo;
}

export default class ExternalOutlet {
  private outlets: { [index: number]: ExternalOutletInfo } = {};

  private client: ModuleClient;

  private uart: Uart;

  private debug = false;

  constructor(client: ModuleClient, uart: Uart, debug = false) {
    this.client = client;
    this.uart = uart;
    this.debug = debug;
  }

  /**
   * 외부콘센트들 추가하기
   * @param newOutlets 외부 콘센트들
   */
  addExternalOutlets(newOutlets: ExternalOutletTwinProperty): void {
    Object.keys(newOutlets).map((index: string) => {
      // index 1000 이하는 예외 처리 : 내부 콘센트 인덱스임
      // 외부 콘센트는 인덱스 1000부터 시작함
      const idx = Number(index);
      if (Number.isNaN(Number(index)) && Number(index) < 1000) {
        return null;
      }

      // 새로 추가된 외부 콘센트이면 외부 콘센트 정보 전부 메세지 보내기
      if (isEmpty(this.outlets[idx])) {
        this.sendMessageNewExternalOutlet(idx, newOutlets[idx]);
      }
      // 기존 있는 외부 콘센트이면 값 달라진 것만 메세지 보내기
      else {
        Object.keys(newOutlets[idx]).map((value: string) => {
          const name = value as ExternalOutletInfoKey;
          if (newOutlets[idx][name] !== this.outlets[idx][name]) {
            this.sendMessage(idx, name, newOutlets[idx][name]);
          }
          return null;
        });
      }
      return null;
    });

    this.outlets = { ...this.outlets, ...newOutlets };
  }

  /**
   * UART 메세지 파싱
   * @param message UART 메세지 ({@link UartMessageType})
   */
  parseFromUartMessage(message: UartMessageType): void {
    this.addExternalOutlets(message.content as ExternalOutletTwinProperty);
  }

  /**
   * Azure IotHub device desired twin property 파싱
   * @param desiredExternalOutlet desired external outlet twin ({@link ExternalOutletTwinProperty})
   */
  private parseFromDesiredTwin(
    desiredExternalOutlet: ExternalOutletTwinProperty
  ): void {
    if (
      isEmpty(desiredExternalOutlet) ||
      Object.keys(desiredExternalOutlet).length < 0
    ) {
      return;
    }

    this.uart.sendMessage({ outlet: desiredExternalOutlet });
  }

  /**
   * Azure IotHub device reported twin property 파싱
   * @param reportedExternalOutlet reported external outlet twin ({@link MeasurerTwinProperty})
   */
  private parseFromReportedTwin(
    reportedExternalOutlet: ExternalOutletTwinProperty
  ): void {
    this.parseFromDesiredTwin(reportedExternalOutlet);
  }

  /**
   * Azure IotHub device twin property 파싱
   * @param twin device twin ({@link DeviceTwin})
   * @param twinState 디바이스 트윈 업데이트 상태 ({@link DeviceTwinState})
   */
  parseFromTwin(twin: DeviceTwin, twinState: DeviceTwinState): void {
    if (twinState === DeviceTwinState.UPDATE_COMPLETE && twin.properties) {
      const desiredExternalOutlet: ExternalOutletTwinProperty = twin.properties
        .desired.outlet as ExternalOutletTwinProperty;
      const reportedExternalOutlet: ExternalOutletTwinProperty = twin.properties
        .reported.outlet as ExternalOutletTwinProperty;
      this.parseFromDesiredTwin(desiredExternalOutlet);
      this.parseFromReportedTwin(reportedExternalOutlet);
    } else {
      const desiredExternalOutlet: ExternalOutletTwinProperty =
        twin.outlet as ExternalOutletTwinProperty;
      this.parseFromDesiredTwin(desiredExternalOutlet);
    }
  }

  /**
   * Azure IoTHub 메세지 보내기
   * @param index 외부 콘센트 번호
   * @param name 값 이름
   * @param value 값
   */
  sendMessage(
    index: number,
    name: ExternalOutletInfoKey,
    value: number | string | boolean
  ): void {
    const message = {
      messageType: 'sensor',
      type: 'outlet',
      deviceID: process.env.IOTEDGE_DEVICEID,
      sensorName: `outlet-${index}`,
      name,
      value,
    };

    const ms = new Message(JSON.stringify(message));
    this.client.sendOutputEvent('outlet', ms, (err, _que) => {
      if (err) {
        console.error(err);
        return;
      }
      this.log('info', `send message: ${JSON.stringify(message)}`);
    });
  }

  /**
   * Azure IoTHub 메세지 보내기
   * @param index 외부 콘센트 번호
   * @param outlet 외부 콘센트
   */
  private sendMessageNewExternalOutlet(
    index: number,
    outlet: ExternalOutletInfo
  ) {
    this.sendMessage(index, 'name', outlet.name);
    this.sendMessage(index, 'power', outlet.power);
    this.sendMessage(index, 'dimmer', outlet.dimmer);
    this.sendMessage(index, 'type', outlet.type);
    this.sendMessage(index, 'timer', outlet.timer);
    this.sendMessage(index, 'startTime', outlet.startTime);
    this.sendMessage(index, 'endTime', outlet.endTime);
    this.sendMessage(index, 'timerInterval', outlet.timerInterval);
    this.sendMessage(index, 'onOffInterval', outlet.onOffInterval);
    this.sendMessage(index, 'lastTimeTurnOn', outlet.lastTimeTurnOn);
  }

  /**
   * 외부 콘센트 로그
   *
   * @param level 로그 레벨
   * @param message 로그 메세지
   * @param useLocalLogger 로컬 로그 사용 유뮤
   * @param optionalParams 파라미터
   */
  private log(
    level: string,
    message?: unknown,
    useLocalLogger = false,
    ...optionalParams: unknown[]
  ): void {
    if (this.debug) {
      logger.log(level, message as string, ...optionalParams, {
        label: 'externalOutlet',
      });
    }

    if (useLocalLogger) {
      localLogger.log(message as string);
    }
  }
}
