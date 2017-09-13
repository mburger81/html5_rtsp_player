import {getTagged} from '../deps/bp_logger.js';
import {BaseTransport} from "../core/base_transport.js";
import {CPU_CORES} from "../core/util/browser.js";

const LOG_TAG = "transport:ws";
const Log = getTagged(LOG_TAG);
const WORKER_COUNT = CPU_CORES;

export default class WebsocketTransport extends BaseTransport {
    constructor(endpoint, stream_type, options={
        socket:`${location.protocol.replace('http', 'ws')}//${location.host}/ws/`,
        workers: 1
    }) {
        super(endpoint, stream_type);
        this.proxies = [];
        this.currentProxy = 0;
        this.workers = 1;
        this.socket_url = options.socket;
        /* Lanthings */
        this.protocols = options.protocols
        /* Lanthings */
        this.ready = this.connect();
    }

    destroy() {
        return this.disconnect().then(()=>{
            return super.destroy();
        });

    }

    static canTransfer(stream_type) {
        return WebsocketTransport.streamTypes().includes(stream_type);
    }

    static streamTypes() {
        return ['hls', 'rtsp'];
    }

    connect() {
        return this.disconnect().then(()=>{
            let promises = [];
            // TODO: get mirror list
            for (let i=0; i<this.workers; ++i) {
                /* Lanthings */
                let proxy = new WebSocketProxy(this.socket_url, this.endpoint, this.stream_type, this.protocols);
                /* Lanthings */

                proxy.set_disconnect_handler((e)=> {
                    this.eventSource.dispatchEvent('disconnected', {code: e.code, reason: e.reason});
                    // TODO: only reconnect on demand
                    if ([1000, 1006, 1013, 1011].includes(e.code)) {
                        setTimeout(()=> {
                            if (this.ready && this.ready.reject) {
                                this.ready.reject();
                            }
                            this.ready = this.connect();
                        }, 3000);
                    }
                });

                proxy.set_data_handler((data)=> {
                    this.dataQueue.push(new Uint8Array(data));
                    this.eventSource.dispatchEvent('data');
                });

                promises.push(proxy.connect().then(()=> {
                    this.eventSource.dispatchEvent('connected');
                }).catch((e)=> {
                    this.eventSource.dispatchEvent('error');
                    throw new Error(e);
                }));
                this.proxies.push(proxy);
            }
            return Promise.all(promises);
        });
    }

    disconnect() {
        let promises = [];
        for (let i=0; i<this.proxies.length; ++i) {
            promises.push(this.proxies[i].close());
        }
        this.proxies= [];
        if (this.proxies.length) {
            return Promise.all(promises);
        } else {
            return Promise.resolve();
        }
    }

    socket() {
        return this.proxies[(this.currentProxy++)%this.proxies.length];
    }

    send(_data, fn) {
        let res = this.socket().send(_data);
        if (fn) {
            fn(res.seq);
        }
        return res.promise;
    }
}

class WebSocketProxy {
    /* Lanthings */
    static get CHN_RTSP() {return 'rtsp';}
    /* Lanthings */

    constructor(wsurl, endpoint, stream_type, protocols) {
        this.url = wsurl;
        this.stream_type = stream_type;
        this.endpoint = endpoint;
        this.data_handler = ()=>{};
        this.disconnect_handler = ()=>{};
        /* Lanthings */
        this.awaitingPromises = null;
        this.protocols = protocols;
        /* Lanthings */
    }

    set_data_handler(handler) {
        this.data_handler = handler;
    }

    set_disconnect_handler(handler) {
        this.disconnect_handler = handler;
    }

    /* Lanthings */
    close() {
        Log.log('closing connection');
        return new Promise((resolve)=>{
            this.dataChannel.onclose = ()=>{
                Log.log('closed');
                resolve();
            };
            this.dataChannel.close();
        });
    }
    /* Lanthings */

    /* Lanthings */
    onDisconnect(){
        this.dataChannel.onclose = null;
        this.dataChannel.close();
    }
    /* Lanthings */

    /* Lanthings */
    initDataChannel() {
        return new Promise((resolve, reject)=>{

            /*Lanthings */
            let prot = [];
            prot.push (WebSocketProxy.CHN_RTSP);

            if (this.protocols) {
                if (this.protocols instanceof Array) {
                    this.protocols.forEach((protocol) => {
                        prot.push(protocol);
                    });
                } else {
                    prot.push(this.protocols);
                }
            }
            this.dataChannel = new WebSocket(this.url, prot);
            /* Lanthings */

            this.dataChannel.binaryType = 'arraybuffer';

            this.connected = false;

            this.dataChannel.onopen = ()=>{
                resolve();
            };
            this.dataChannel.onmessage = (ev)=>{
                Log.debug(`[data]\r\n${ev.data}`);

                if(ev.data instanceof ArrayBuffer) {
                    if (this.data_handler) {
                        this.data_handler(ev.data);
                    }
                } else if(this.awaitingPromise) {
                    var res = { seq: 1, payload: ev.data };
                    this.awaitingPromise.resolve(res);
                }
            };
            this.dataChannel.onerror = (e)=>{
                Log.error(`[data] ${e.type}`);
                this.dataChannel.close();
            };
            this.dataChannel.onclose = (e)=>{
                Log.error(`[data] ${e.type}. code: ${e.code}, reason: ${e.reason || 'unknown reason'}`);
                this.onDisconnect(e);
            };
        });
    }
    /* Lanthings */

    /* Lanthings */
    connect() {
        return new Promise((resolve, reject)=>{
            this.initDataChannel().then(resolve).catch(reject);
        });
    }
    /* Lanthings */

    /* Lanthings */
    send(payload) {
        if (this.dataChannel.readyState != WebSocket.OPEN) {
            this.close();
            // .then(this.connect.bind(this));
            // return;
            throw new Error('disconnected');
        }
        // Log.debug(payload);
        return {
            seq:1,
            promise: new Promise((resolve, reject)=>{
                this.awaitingPromise = {resolve, reject};
                Log.debug(payload);
                this.dataChannel.send(payload);
            })};
    }
    /* Lanthings */
}