import { ApiByApi, Market } from "../interfaces/index";
import { Binance } from "../markets/binance";
import { Bitget } from "../markets/bitget";
import { Bybit } from "../markets/bybit";
import { Huobi } from "../markets/huobi";
import { Okx } from "../markets/okx";
import { Exchange } from "./exchange";

export function getClient(api: ApiByApi): Exchange {
  const [pass, key] = api.key.split("/");
  switch (api.market) {
    case Market.Binance:
      return new Binance(api.key, api.secret);
    case Market.Bybit:
      return new Bybit(api.key, api.secret);
    case Market.Huobi:
      return new Huobi(api.key, api.secret);
    case Market.OKX:
      return new Okx(key, api.secret, pass);
    case Market.Bitget:
      return new Bitget(key, api.secret, pass);
  }
}
