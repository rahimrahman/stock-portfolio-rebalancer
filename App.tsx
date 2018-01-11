import * as React from 'react';
import {
  Button,
  StyleSheet,
  Text,
  ScrollView,
  View,
  SectionList,
  FlatList,
  TouchableHighlight,
  Dimensions,
  AsyncStorage
} from 'react-native';
import { SecureStore } from 'expo';

const ORIGINAL_PORTFOLIO = [
  { symbol: "AAPL", quantity: 50, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 0 },
  { symbol: "GOOG", quantity: 200, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 0 },
  { symbol: "CYBR", quantity: 150, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 0 },
  { symbol: "ABB", quantity: 900, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 0 },
];

const DESIRED_PORTFOLIO = [
  { symbol: "AAPL", percentageOfPortfolio: 22 },
  { symbol: "GOOG", percentageOfPortfolio: 38 },
  { symbol: "GFN", percentageOfPortfolio: 25 },
  { symbol: "ACAD", percentageOfPortfolio: 15 },
];

const ALPHA_ADVANTAGE_API_KEY = 'HDLQ3WL4C8ASYGCG';

interface PortfolioProps {
  symbol: string,
  quantity: number,
  deltaQuantity: number,
  marketValue: number,
  percentageOfPortfolio: number
}

interface DesiredPortfolioProps {
  symbol: string,
  percentageOfPortfolio: number,
};

interface AppState {
  calculating: boolean,
  cashOnHand: number,
  overallMarketValue: number;
  userPortfolio: PortfolioProps[];
  desiredPortfolio: DesiredPortfolioProps[];
  stockInfo: { [name: string]: { closeValue: number } };
};

export default class App extends React.Component<any, AppState> {
  constructor(props: any) {
    super(props);

    this.state = {
      calculating: false,
      cashOnHand: 0,
      overallMarketValue: 0,
      userPortfolio: this.deepClone(ORIGINAL_PORTFOLIO),
      desiredPortfolio: this.deepClone(DESIRED_PORTFOLIO),
      stockInfo: {}
    }
  }

  onCalculateButtonPress = () => {
    this.getStockDataForCurrentAndDesiredPortfolio();
  }

  onRebalanceButtonPress = () => {
    this.rebalancePortfolio();
  }

  onResetButtonPress = () => {
    this.setState({ userPortfolio: ORIGINAL_PORTFOLIO.slice(0) }, () => console.log(this.state.userPortfolio));
  }

  onUpdateStockDataButtonPress = () => {
    const { stockInfo } = this.state;

    Object.keys(stockInfo).map(symbol => {
      SecureStore.deleteItemAsync(`AA_RESPONSE_${symbol}`);
    });

    this.setState({ stockInfo: {} });
  }

  getStockDataForCurrentAndDesiredPortfolio = () => {
    // we make this a promise because we need to get the closing value (closeValue) so that we
    // can figure out the percentage of the stock in the portfolio.
    // the percentage of stock in portfolio is the market value of each stock (quantity * closing value)
    // divide by the overall market value

    return new Promise((resolve, reject) => {
      const { userPortfolio, desiredPortfolio } = this.state;
      let userPortfolioCounter: number = 0;
      let overallMarketValue: number = 0;

      this.setState({ calculating: true });

      userPortfolio.map((item, index) => {
        const { symbol } = item;
        this.fetchStock(symbol)
          .then(() => {
            const { stockInfo } = this.state;
            const marketValue: number = Number((item.quantity * stockInfo[symbol].closeValue).toFixed(2));
            overallMarketValue = overallMarketValue + marketValue;

            item['marketValue'] = marketValue;
            userPortfolio[index] = item;

            // the market value for each stock and tallied overall market value
            console.log(
              `${symbol}:: ${item.quantity} * ${stockInfo[symbol].closeValue} = ${marketValue}`
            );

            userPortfolioCounter++;
            if (userPortfolioCounter === userPortfolio.length) {
              this.setState({ overallMarketValue, userPortfolio }, () => this.calculatePercentageOfPortfolio());


              let desiredPortfolioCounter = 0;

              if (desiredPortfolio.length > 0) {
                desiredPortfolio.map((item, index) => {
                  // we might as well start getting data about stocks in our desired portfolio.
                  this.fetchStock(item.symbol)
                    .then(() => {
                      desiredPortfolioCounter++;
                      if (desiredPortfolioCounter === desiredPortfolio.length) {
                        this.setState({ calculating: false });
                        resolve();
                      }
                    })
                    .catch((err) => {
                      this.setState({ calculating: false });
                      console.log(err);
                      reject(err);
                    });
                });
              } else {
                this.setState({ calculating: false });
                resolve();
              }
            }
          })
          .catch((err) => {
            this.setState({ calculating: false });
            console.log(err);
            reject(err)
          });
      });
    });
  }

  fetchStock = (symbol: string) => {
    const { stockInfo } = this.state;

    return new Promise((resolve, reject) => {
      if (typeof stockInfo[symbol] !== 'undefined') resolve(); // skip if we already have the data
      else {
        // 
        SecureStore.getItemAsync(`AA_RESPONSE_${symbol}`)
          .then((stringifiedResponseJson: string) => {
            stockInfo[symbol] = { closeValue: this.getCloseValueFromStockResponse(stringifiedResponseJson) };
            this.setState({ stockInfo }, () => resolve());
          })
          .catch(() => {
            fetch(`https://www.alphavantage.co/query?apikey=${ALPHA_ADVANTAGE_API_KEY}&function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}`, {
              method: 'GET'
            })
              .then((response) => response.json())
              .then((responseJson) => {
                const stringifiedResponseJson = JSON.stringify(responseJson);
                SecureStore.setItemAsync(`AA_RESPONSE_${symbol}`, stringifiedResponseJson);
                stockInfo[symbol] = { closeValue: this.getCloseValueFromStockResponse(stringifiedResponseJson) };
                this.setState({ stockInfo }, () => resolve());
              })
              .catch((err) => {
                reject(err);
              })
          });
      }
    })
  }

  getCloseValueFromStockResponse = (stringifiedJson: string) => {
    const responseJson = JSON.parse(stringifiedJson);

    const lastRefreshed: string = responseJson['Meta Data']['3. Last Refreshed'].split(' ')[0];
    const latestFromTimeSeries: string = responseJson['Time Series (Daily)'][`${lastRefreshed}`];
    const closeValue: number = Number(responseJson['Time Series (Daily)'][`${lastRefreshed}`]['4. close']);

    return closeValue;
  }

  calculatePercentageOfPortfolio = () => {
    const { userPortfolio, overallMarketValue } = this.state;
    let userPortfolioCounter = 0;

    userPortfolio.map((item, index) => {
      item['percentageOfPortfolio'] = item.marketValue / overallMarketValue * 100;
      userPortfolio[index] = item;

      userPortfolioCounter++;
      if (userPortfolioCounter >= userPortfolio.length) this.setState({ userPortfolio });
    })
  }

  rebalancePortfolio = () => {
    // 1. we need to know the current percentage of stocks in our portfolio
    this.getStockDataForCurrentAndDesiredPortfolio()
      .then(() => {
        // 2. go through original portfolio and trade based on if the desired portfolio
        // requires the stock to added, traded away, or dump completely.
        // TODO: has to be a cleaner way to do this!
        const { desiredPortfolio, userPortfolio, stockInfo, overallMarketValue } = this.state;
        let newPortfolio = userPortfolio;
        let cashOnHand = 0;

        userPortfolio.map((item, index) => {
          const { symbol, percentageOfPortfolio, quantity, marketValue } = item;
          const { closeValue } = stockInfo[symbol];
          let deltaQuantity = 0;
          let newQuantity = 0;
          let newPercentageOfPortfolio = 0;
          let newMarketValue = 0;

          const currentDesiredStock = desiredPortfolio.find((x) => x.symbol === symbol);
          if (typeof currentDesiredStock === 'undefined') {
            // dump all for stocks that are not in the desired portfolio
            deltaQuantity = -(item.quantity);
            cashOnHand = cashOnHand + marketValue;
            newQuantity = 0;
          } else {
            // trade existing stocks to the new percentage of portfolio based
            // on the original overall market value
            const deltaPercentageOfPortfolio = currentDesiredStock.percentageOfPortfolio - percentageOfPortfolio;
            deltaQuantity = this.calculateDeltaQuantityFromDeltaPercentage(
              (deltaPercentageOfPortfolio / 100),
              overallMarketValue,
              closeValue
            );

            // deltaQuantity can be a positive or negative integer. Buy === positive, Sell === negative
            newQuantity = quantity + deltaQuantity;
            newMarketValue = (newQuantity * closeValue)
            cashOnHand = cashOnHand + marketValue - newMarketValue;
            newPercentageOfPortfolio = newQuantity * closeValue * 100 / overallMarketValue;
          }

          newPortfolio = this.mutatePortfolio(newPortfolio, {
            symbol,
            quantity: newQuantity,
            deltaQuantity,
            marketValue: newMarketValue,
            percentageOfPortfolio: newPercentageOfPortfolio
          });
        });

        desiredPortfolio.map((item, index) => {
          const { symbol, percentageOfPortfolio } = item;
          const existingStock = userPortfolio.find((x) => x.symbol === symbol);
          if (typeof existingStock === 'undefined') {
            const newQuantity = this.calculateDeltaQuantityFromDeltaPercentage(
              (percentageOfPortfolio / 100),
              overallMarketValue,
              stockInfo[symbol].closeValue);

            const newMarketValue = newQuantity * stockInfo[symbol].closeValue;
            cashOnHand = cashOnHand - newMarketValue;

            // console.log(`${newQuantity} * ${stockInfo[symbol].closeValue} = ${newMarketValue}`);

            newPortfolio = this.mutatePortfolio(newPortfolio, {
              symbol,
              quantity: newQuantity,
              deltaQuantity: newQuantity,
              marketValue: newMarketValue,
              percentageOfPortfolio: (newMarketValue / overallMarketValue) * 100,
            });
          }
        });

        this.setState({ userPortfolio: newPortfolio }, () => {
          // 3. Let's see if we can buy more stocks with the cash on hand.
          if (cashOnHand > 0) newPortfolio = this.tradeWithCashOnHand(cashOnHand, newPortfolio, 0, 0);
        });
      });
  }


  tradeWithCashOnHand = (cashOnHand: number, portfolio: PortfolioProps[], portfolioIndex: number, failed: number): any => {
    // Recursive function.  Will go through each desired portfolio and buy 1 stock at a time until 
    // cash on hand can't buy anything anymore.
    const { stockInfo, desiredPortfolio, overallMarketValue } = this.state;
    const currentStock = portfolio[portfolioIndex];
    const { symbol, quantity, deltaQuantity, marketValue, percentageOfPortfolio } = currentStock;

    if (stockInfo[symbol].closeValue < cashOnHand && typeof desiredPortfolio.find((x) => x.symbol === symbol) !== 'undefined') {
      const quantityToTrade = 1;
      const newQuantity = quantity + quantityToTrade;
      const newDeltaQuantity = deltaQuantity + quantityToTrade;
      const newMarketValue = newQuantity * stockInfo[symbol].closeValue;
      portfolio = this.mutatePortfolio(portfolio, {
        symbol,
        quantity: newQuantity,
        deltaQuantity: newDeltaQuantity,
        marketValue: newMarketValue,
        percentageOfPortfolio: (newMarketValue / overallMarketValue) * 100,
      });

      cashOnHand = cashOnHand - stockInfo[symbol].closeValue;
      failed = 0;
    }
    else failed++;

    portfolioIndex++;
    if (portfolioIndex >= portfolio.length) portfolioIndex = 0;
    if (failed === portfolio.length) return portfolio;
    if (cashOnHand > 0) this.tradeWithCashOnHand(cashOnHand, portfolio, portfolioIndex, failed);
  }

  mutatePortfolio = (portfolio: PortfolioProps[], portfolioProps: PortfolioProps) => {
    const { symbol, quantity, deltaQuantity, marketValue, percentageOfPortfolio } = portfolioProps;
    const portfolioIndex = portfolio.findIndex((p) => p.symbol === symbol);

    if (portfolioIndex !== -1) {
      portfolio[portfolioIndex] = { symbol, quantity, deltaQuantity, marketValue, percentageOfPortfolio };
    } else {
      portfolio.push({ symbol, quantity, deltaQuantity, marketValue, percentageOfPortfolio });
    }

    return portfolio;
  }

  calculateDeltaQuantityFromDeltaPercentage = (percentageOfPortfolio: number, overallMarketValue: number, closeValue: number) =>
    Math.floor(percentageOfPortfolio * overallMarketValue / closeValue);


  deepClone = (arr: {}[]): any => {
    const out: PortfolioProps[] = [];
    for (var i = 0, len = arr.length; i < len; i++) {
      const item: any = arr[i];
      const obj: any = {};
      for (var k in item) {
        obj[k] = item[k];
      }
      out.push(obj);
    }
    return out;
  }

  roundDown = (value: number, decimals: number) => {
    return Number(Math.round(value * 10 ** decimals) / 10 ** decimals);
  }

  keyExtractor = (item: { symbol: string }, index: number) => item.symbol;

  //
  // RENDER
  //

  renderPortfolioRow = (rowData: { item: PortfolioProps }) => {
    const { symbol, quantity, deltaQuantity, percentageOfPortfolio, marketValue } = rowData.item;
    const { stockInfo } = this.state;
    let closeValue = 0.00;
    if (typeof stockInfo[symbol] !== 'undefined') closeValue = stockInfo[symbol].closeValue;

    return (
      <View>
        <View style={styles.sectionContainer}>
          <View style={{ flex: 1 }}>
            <View>
              <Text style={{ alignSelf: 'stretch', textAlign: 'left' }}>{symbol}</Text>
            </View>
            <View>
              <Text>{closeValue === 0 ? '' : closeValue.toFixed(2)}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ alignSelf: 'stretch', textAlign: 'right' }}>{quantity} {this.renderDeltaQuantity(deltaQuantity)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ alignSelf: 'stretch', textAlign: 'right' }}>${marketValue.toFixed(2)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ alignSelf: 'stretch', textAlign: 'right' }}>{percentageOfPortfolio.toFixed(2)}%</Text>
          </View>
        </View>
        {this.renderSeparatorLine()}
      </View>
    );
  }

  renderDesiredPortfolioRow = (rowData: { item: DesiredPortfolioProps }) => {
    const { symbol, percentageOfPortfolio } = rowData.item;
    const { stockInfo } = this.state;
    let closeValue = 0.00;
    if (typeof stockInfo[symbol] !== 'undefined') closeValue = stockInfo[symbol].closeValue;

    return (
      <View>
        <View style={styles.sectionContainer}>
          <View style={{ flex: 1 }}>
            <View>
              <Text style={{ alignSelf: 'stretch', textAlign: 'left' }}>{symbol}</Text>
            </View>
            <View>
              <Text>{closeValue === 0 ? '' : closeValue.toFixed(2)}</Text>
            </View>
          </View>
          <View style={{ flex: 1 }} />
          <View style={{ flex: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ alignSelf: 'stretch', textAlign: 'right' }}>{percentageOfPortfolio.toFixed(2)}%</Text>
          </View>
        </View>
        {this.renderSeparatorLine()}
      </View>
    );
  }

  renderSeparatorLine = () => {
    return (<View style={{ alignSelf: 'stretch', height: 1, borderColor: '#dddddd', borderBottomWidth: 1 }} />);
  }

  renderDeltaQuantity = (deltaQuantity: number) => {
    if (deltaQuantity > 0) {
      return (<Text style={{ color: 'green' }}>({deltaQuantity})</Text>);
    } else if (deltaQuantity < 0) return (<Text style={{ color: 'red' }}>({deltaQuantity})</Text>);

    return (<Text>({deltaQuantity})</Text>);
  }


  render() {
    const { container, sectionContainer, sectionHeaderContainer } = styles;
    return (
      <ScrollView>
        <View style={container}>
          <View style={{ height: 64 }} />

          <View style={{ alignSelf: 'stretch' }}>
            <View style={sectionHeaderContainer}><Text style={{ textAlign: 'right' }}>YOUR PORTFOLIO</Text></View>
            <FlatList
              data={this.state.userPortfolio}
              extraData={this.state}
              renderItem={(rowData) => this.renderPortfolioRow(rowData)}
              keyExtractor={this.keyExtractor}
              style={{ alignSelf: 'stretch' }}
              scrollEnabled={false}
            />
          </View>

          <View style={sectionContainer}>
            <View style={{ flex: 2 }}><Text>TOTAL</Text></View>
            <View style={{ flex: 1 }}><Text style={{ alignSelf: 'stretch', textAlign: 'right' }}>${(this.state.overallMarketValue).toFixed(2)}</Text></View>
            <View style={{ flex: 1 }} />
          </View>
          {this.renderSeparatorLine()}

          <View style={sectionContainer}>
            <Button title={this.state.calculating ? 'CALCULATING' : 'CALCULATE'} onPress={() => this.onCalculateButtonPress()} color={'blue'} />
            <View style={{ width: 5 }} />
            <Button title={'REBALANCE'} onPress={() => this.onRebalanceButtonPress()} color={'blue'} />
          </View>

          <View style={{ alignSelf: 'stretch' }}>
            <View style={sectionHeaderContainer}><Text style={{ textAlign: 'right' }}>DESIRED PORTFOLIO</Text></View>
            <FlatList
              data={DESIRED_PORTFOLIO}
              renderItem={(rowData) => this.renderDesiredPortfolioRow(rowData)}
              keyExtractor={this.keyExtractor}
              style={{ alignSelf: 'stretch' }}
              scrollEnabled={false}
            />
          </View>

          <View style={sectionContainer}>
            <Button title={'RESET PORTFOLIO'} onPress={() => this.onResetButtonPress()} color={'blue'} />
            <View style={{ width: 5 }} />
            <Button title={'RESET STOCK DATA'} onPress={() => this.onUpdateStockDataButtonPress()} color={'blue'} />
          </View>
        </View>
      </ScrollView>
    );
  }
}

//
// Component Styles
//

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionContainer: {
    flexDirection: 'row',
    padding: 10
  },
  sectionHeaderContainer: {
    padding: 10,
    height: 30,
    justifyContent: 'center',
    backgroundColor: '#dddddd'
  }
});
