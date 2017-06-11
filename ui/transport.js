import { PersistedQueryNetworkInterface, addPersistedQueries } from 'persistgraphql';
import { SubscriptionClient, addGraphQLSubscriptions } from 'subscriptions-transport-ws';
import { Socket } from 'phoenix-socket';
import queryMap from '../extracted_queries.json';
import config from './config';
import { print } from 'graphql/language/printer';

function buildPayload(request) {
  let payload = request && request.query ?
    {
      ...request,
      query: typeof request.query === 'string' ? request.query : print(request.query),
    }
  : request

  return payload;
}

function createBaseWSTransport() {
  const socket = new Socket("ws://localhost:3010/socket", {});
  // Authentication
  socket.connect();
  let chan = socket.channel('__absinthe__:control');

  chan
    .join()
    .receive("ok", resp => { console.log("Joined absinthe control socket", resp) })
    .receive("error", resp => { console.log("Unable to join absinthe control socket", resp) });

  let client = {
    subscribe: (request, b) => {
      let payload = buildPayload(request);
      console.log(payload);
      chan.push("doc", payload)
        .receive("ok", (msg) => {console.log("subscription created", msg) })
        .receive("error", (reasons) => console.log("subscription failed", reasons) )
        .receive("timeout", () => console.log("Networking issue...") )
      console.log(b);
      return 1;
    }
  }

  return client;
}

function createFullNetworkInterface(baseWsTransport) {
  if (config.persistedQueries) {
    return addPersistedQueries(baseWsTransport, queryMap);
  }

  return baseWsTransport;
}

// Returns either a standard, fetch-full-query network interface or a
// persisted query network interface (from `extractgql`) depending on
// the configuration within `./config.js.`
export function getPersistedQueryNetworkInterface(host = '', headers = {}) {
  return new PersistedQueryNetworkInterface({
    queryMap,
    uri: `${host}/graphql`,
    opts: {
      credentials: 'same-origin',
      headers,
    },
    enablePersistedQueries: config.persistedQueries,
  });
}

function createHybridNetworkInterface(baseWsTransport = {}, host = '', headers = {}) {
  return addGraphQLSubscriptions(
    getPersistedQueryNetworkInterface(host, headers),
    baseWsTransport,
  );
}

export function getHybridOrFullNetworkInterface(host = '', headers = {}) {
  const isHybridWSTransportType = config.wsTransportType !== 'full';
  const baseWsTransport = createBaseWSTransport();

  return isHybridWSTransportType
      ? createHybridNetworkInterface(baseWsTransport, host, headers)
      : createFullNetworkInterface(baseWsTransport);
}
