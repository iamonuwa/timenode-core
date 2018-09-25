import Config from '../Config';
import { ReconnectMsg } from '../Enum';
import W3Util from '../Util';

import * as EventEmitter from 'eventemitter3';
/* tslint:disable */
declare const setTimeout: any;

export default class WsReconnect extends EventEmitter {
  public config: Config;
  public maxRetries: number;

  private reconnectTries: number = 0;
  private reconnecting: boolean = false;
  private reconnected: boolean = false;

  constructor(maxRetries: number) {
    super();
    this.maxRetries = maxRetries;
  }

  public setup(config: Config): void {
    this.config = config;

    const {
      logger,
      web3: { currentProvider }
    } = this.config;

    currentProvider.on('error', (err: any) => {
      this.emit('disconnect');
      logger.debug(`[WS ERROR] ${err}`);
      setTimeout(async () => {
        // const msg: ReconnectMsg =
        await this.handleWsDisconnect();
        // logger.debug(`[WS RECONNECT] ${msg}`);
      }, this.reconnectTries * 1000);
    });

    currentProvider.on('end', (err: any) => {
      this.emit('disconnect');
      logger.debug(`[WS END] Type= ${err.type} Reason= ${err.reason}`);
      setTimeout(async () => {
        // const msg =
        await this.handleWsDisconnect();
        // logger.debug(`[WS RECONNECT] ${msg}`);
      }, this.reconnectTries * 1000);
    });
  }

  public async handleWsDisconnect(): Promise<ReconnectMsg> {
    if (this.reconnected) {
      return ReconnectMsg.ALREADY_RECONNECTED;
    }
    if (this.reconnectTries >= this.config.maxRetries) {
      return ReconnectMsg.MAX_ATTEMPTS;
    }
    if (this.reconnecting) {
      return ReconnectMsg.RECONNECTING;
    }

    // Try to reconnect.
    this.reconnecting = true;
    const nextWeb3 = await this.wsReconnect();
    if (nextWeb3) {
      this.emit('reconnect', nextWeb3);
      this.reconnectTries = 0;
      this.reconnected = true;
      this.reconnecting = false;
      setTimeout(() => {
        this.reconnected = false;
      }, 15000);
      return ReconnectMsg.RECONNECTED;
    }

    this.reconnecting = false;
    this.reconnectTries++;
    setTimeout(() => {
      this.handleWsDisconnect();
    }, this.reconnectTries * 1000);

    return ReconnectMsg.FAIL;
  }

  private async wsReconnect(): Promise<any> {
    const { logger, providerUrls } = this.config;
    logger.debug('Attempting WS Reconnect.');
    try {
      const providerUrl = providerUrls[this.reconnectTries % providerUrls.length];
      const web3 = W3Util.getWeb3FromProviderUrl(providerUrl);
      const nextUtil = new W3Util(web3);
      if (!(await nextUtil.isWatchingEnabled())) {
        throw new Error('Next Provider is not valid.');
      }
      return web3;
    } catch (err) {
      logger.error(err.message);
      logger.info(`Reconnect tries: ${this.reconnectTries}`);
      return null;
    }
  }
}
