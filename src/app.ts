/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Mqtt } from 'azure-iot-device-mqtt';
import { Message, ModuleClient } from 'azure-iot-device';
import { DeviceTwinState, DeviceTwin } from '@sangsangfarm/types';
import wait from 'waait';
import express, { Request, Response } from 'express';
import cors from 'cors';
import {
  existsSync,
  writeFileSync,
  readFileSync,
  copyFileSync,
  mkdirSync,
} from 'fs';
import { exec } from 'child_process';
import {
  checkConnection,
  isNotEmpty,
  localLogger,
  logger,
} from '@sangsangfarm/utils';
import FeedMaker from './feedMaker';
import Measurer from './measurer';

const logTag = 'IG100';

let connection = false;
const main = async () => {
  logger.log('info', '기기가 부팅되었습니다.', {
    label: logTag,
  });
  localLogger.log('기기가 부팅되었습니다.');

  // IoT Edge Client 연결
  const client: ModuleClient = await ModuleClient.fromEnvironment(Mqtt).catch(
    (error: Error) => {
      throw error;
    }
  );

  await client.open().catch((error: Error) => {
    throw error;
  });

  // Module Twin 가져오기
  const twin = await client.getTwin().catch((error: Error) => {
    throw error;
  });

  const feedMaker = new FeedMaker(client, twin, true);
  const measurer = new Measurer(client, feedMaker, true);

  let maxLogNum = 0;

  await wait(5000);

  // 로컬에 저장한 Module Twin 가져오기
  const isExistTwinFile = existsSync('logs/twin.log');
  let flag = false;
  if (isExistTwinFile) {
    let content: string = readFileSync('logs/twin.log', 'utf-8');
    try {
      JSON.parse(content);
    } catch {
      flag = true;
    }

    if (flag) {
      try {
        content = readFileSync('logs/twin_backup.log', 'utf-8');
        JSON.parse(content);
      } catch {
        content = '{}';
      }
    }

    // 로컬 Module Twin 적용
    const localTwin = JSON.parse(content);

    maxLogNum = localTwin.maxLogNum || 500;

    feedMaker.parseFromTwin(
      { properties: { desired: localTwin, reported: localTwin } },
      DeviceTwinState.UPDATE_COMPLETE
    );
    measurer.parseFromTwin(
      { properties: { desired: localTwin, reported: localTwin } },
      DeviceTwinState.UPDATE_COMPLETE
    );
  }

  feedMaker.parseFromTwin(
    {
      properties: {
        desired: {},
        reported: twin.properties.reported,
      },
    },
    DeviceTwinState.UPDATE_COMPLETE
  );
  measurer.parseFromTwin(
    {
      properties: {
        desired: {},
        reported: twin.properties.reported,
      },
    },
    DeviceTwinState.UPDATE_COMPLETE
  );

  // 로컬 서버 시작
  const app = express();

  app.use(cors());
  app.set('json spaces', 2);
  app.use(express.json());

  // 현재 기기 정보 가져오기
  app.get('/', async (_req: Request, res: Response) => {
    const result: Record<string, unknown> = {
      connection,
      feedMaker: feedMaker.getProperty(),
      measurer: measurer.getProperty(),
      outlet: feedMaker.getOutlet().getProperty(),
      waterLevel: feedMaker.getWaterLevel().getProperty(),
      time: new Date().toISOString(),
    };

    if (
      isNotEmpty(process.env.GET_LOG) &&
      process.env.GET_LOG.toLowerCase() === 'true'
    ) {
      const logs = localLogger.getLogs();
      logs.length = logs.length > maxLogNum ? maxLogNum : logs.length;
      result.logs = logs;
    }

    res.status(200).json(result);
  });

  // 현재 기기 정보 변경
  app.patch('/', async (req: Request, res: Response) => {
    const { property } = req.body;
    feedMaker.parseFromTwin(property, DeviceTwinState.UPDATE_PARTIAL);
    measurer.parseFromTwin(property, DeviceTwinState.UPDATE_PARTIAL);

    const result: Record<string, unknown> = {
      connection,
      feedMaker: feedMaker.getProperty(),
      measurer: measurer.getProperty(),
      outlet: feedMaker.getOutlet().getProperty(),
      waterLevel: feedMaker.getWaterLevel().getProperty(),
      time: new Date().toISOString(),
    };

    if (
      isNotEmpty(process.env.GET_LOG) &&
      process.env.GET_LOG.toLowerCase() === 'true'
    ) {
      const logs = localLogger.getLogs();
      logs.length = logs.length > maxLogNum ? maxLogNum : logs.length;
      result.logs = logs;
    }

    res.status(200).json(result);
  });

  // 로컬 로그 가져오기
  app.get('/log', (req: Request, res: Response) => {
    const { time, num } = req.query;

    let logs = localLogger.getLogs();

    if (isNotEmpty(time) && !Number.isNaN(Date.parse(time as string))) {
      logs = logs.filter(
        (log) => Date.parse(time as string) - new Date(log.time).getTime() > 0
      );
    }

    if (Number.isNaN(Number(num))) {
      logs = logs.slice(0, 20);
    } else {
      logs = logs.slice(0, Number(num) as number | 20);
    }

    const result = {
      logs,
      num: logs.length,
    };

    res.status(201).json(result);
  });

  // 로컬 로그 추가
  app.post('/log', async (req: Request, res: Response) => {
    const { log } = req.body;

    const result: Record<string, unknown> = {
      connection,
      feedMaker: feedMaker.getProperty(),
      measurer: measurer.getProperty(),
      outlet: feedMaker.getOutlet().getProperty(),
      waterLevel: feedMaker.getWaterLevel().getProperty(),
      time: new Date().toISOString(),
    };

    localLogger.log(log);

    if (
      isNotEmpty(process.env.GET_LOG) &&
      process.env.GET_LOG.toLowerCase() === 'true'
    ) {
      const logs = localLogger.getLogs();
      logs.length = logs.length > maxLogNum ? maxLogNum : logs.length;
      result.logs = logs;
    }

    res.status(201).json(result);
  });

  // 로컬 시간 수정
  app.patch('/time', (req: Request, res: Response) => {
    const { timestamp } = req.body;
    const time = new Date(timestamp);

    exec(
      `/bin/date --set="${time.getFullYear()}.${
        time.getMonth() + 1
      }.${time.getDate()}-${time.getHours()}:${time.getMinutes()}:00"`
    );

    localLogger.log(
      `현재 시간을 ${time.getFullYear()}년 ${
        time.getMonth() + 1
      }월 ${time.getDate()}일 ${time.getHours()}시 ${time.getMinutes()}분으로 변경 하였습니다.`
    );

    res.status(200).json(new Date(time));
  });

  // 로컬 로그 리셋
  app.delete('/log', (_req: Request, res: Response) => {
    localLogger.reset();

    res.status(204).json();
  });

  const port = 80;
  app.listen(port);

  setInterval(() => {
    checkConnection().then((currentConnection) => {
      connection = currentConnection;
    });
  }, 1000 * 60);

  setInterval(() => {
    const outlet = feedMaker.getOutlet();
    outlet.run();
    feedMaker.syncFeedPump();
  }, 50);

  setInterval(() => {
    const waterlevel = feedMaker.getWaterLevel();
    waterlevel.run();
  }, 1000);

  setInterval(() => {
    feedMaker.make();
  }, 1000);

  setInterval(() => {
    feedMaker.circularFeed();
  }, 1000);

  setInterval(() => {
    feedMaker.dripFeed();
  }, 1000);

  setInterval(() => {
    feedMaker.seed();
  }, 1000);

  setInterval(() => {
    measurer.run();
  }, 1000);

  // 로컬 Module Twin 저장
  let saveBlock = false;
  let saveCount = 1;
  setInterval(() => {
    if (saveBlock) {
      return;
    }

    saveBlock = true;

    if (saveCount > 307 * 59 - 10) {
      saveCount = 1;
    }

    const isExistDir = existsSync('logs');
    if (!isExistDir) {
      mkdirSync('logs');
    }

    const isExistFile = existsSync('logs/twin.log');
    if (!isExistFile) {
      writeFileSync('logs/twin.log', '{}', 'utf-8');
    }

    if (saveCount % 59 === 0) {
      const result = {
        maxLogNum,
        feedMaker: feedMaker.getProperty(),
        measurer: measurer.getProperty(),
        outlet: feedMaker.getOutlet().getProperty(),
        waterLevel: feedMaker.getWaterLevel().getProperty(),
      };
      const startTime = new Date().getTime();
      writeFileSync('logs/twin.log', JSON.stringify(result), 'utf-8');
      const endTime = new Date().getTime();
      logger.log('info', `save twin log file: ${endTime - startTime} ms`, {
        label: logTag,
      });
    }

    if (saveCount % 307 === 0) {
      const startTime = new Date().getTime();
      localLogger.save();
      const endTime = new Date().getTime();
      logger.log('info', `save local log file: ${endTime - startTime} ms`, {
        label: logTag,
      });
    }

    if (saveCount % 601 === 0) {
      const startTime = new Date().getTime();
      copyFileSync('logs/twin.log', 'logs/twin_backup.log');
      const endTime = new Date().getTime();
      logger.log(
        'info',
        `save twin backup log file: ${endTime - startTime} ms`,
        {
          label: logTag,
        }
      );
    }

    saveCount += 1;
    saveBlock = false;
  }, 1000);

  // Module Twin 변경 반영
  let isFirstTwin = true;

  twin.on('properties.desired', (desiredTwin: DeviceTwin) => {
    logger.log(
      'info',
      `new reported properties received: ${JSON.stringify(desiredTwin)}`,
      {
        label: logTag,
      }
    );

    // 부팅후 첫 디바이스 트윈 무시
    if (isFirstTwin) {
      isFirstTwin = false;
    }
    // 모듈 업데이트일 경우 디바이스 트윈 업데이트 무시
    else if (!desiredTwin.isUpdate) {
      if (isNotEmpty(desiredTwin.maxLogNum)) {
        maxLogNum = desiredTwin.maxLogNum as number;
      }

      if (isNotEmpty(desiredTwin.resetLog)) {
        localLogger.reset();
      }

      feedMaker.parseFromTwin(desiredTwin, DeviceTwinState.UPDATE_PARTIAL);
      measurer.parseFromTwin(desiredTwin, DeviceTwinState.UPDATE_PARTIAL);
    }
  });

  // 메세지 보내기
  client.on('inputMessage', (inputName: string, msg: Message) => {
    client.complete(msg);
    if (inputName === 'parse') {
      const message = msg.getBytes().toString('utf8');
      if (message) {
        logger.log('info', message, {
          label: logTag,
        });
      }
    }
  });
};

main();

// 에러 처리
process.on(
  'unhandledRejection',
  (reason: unknown, _promise: Promise<unknown>) => {
    throw reason;
  }
);

process.on('uncaughtException', (error: Error): void => {
  logger.log('error', `${error.message} ${error.stack}`, {
    label: logTag,
  });
});
