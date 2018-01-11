import * as React from 'react';
import {
  Button,
  StyleSheet, 
  Text,
  View,
  FlatList,
  TouchableHighlight,
  Dimensions
} from 'react-native';

const STARTING_STOCK = [
  { symbol: "AAPL", quantity: 50, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 0 }, 
  { symbol: "GOOG", quantity: 200, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 0 },
  { symbol: "CYBR", quantity: 150, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 0 },
  { symbol: "ABB", quantity: 900, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 0 },
];

const REBALANCE_STOCK = [
  { symbol: "AAPL", quantity: 0, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 22 },
  { symbol: "GOOG", quantity: 0, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 38 },
  { symbol: "GFN", quantity: 0, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 25 },
  { symbol: "ACAD", quantity: 0, deltaQuantity: 0, marketValue: 0, percentageOfPortfolio: 15 },

];

const ALPHA_ADVANTAGE_API_KEY = 'HDLQ3WL4C8ASYGCG';

interface PortfolioProps {
  symbol: string,
  quantity: number,
  deltaQuantity: number,
  marketValue: number,
  percentageOfPortfolio: number
}

interface AppState {
  overallMarketValue: number;
  originalPortfolio: PortfolioProps[];
  desiredPortfolio: PortfolioProps[];
  stockInfo: { [name: string]: { closeValue: number }};
};

export default class App extends React.Component<any, AppState> {
  constructor(props: any) {
    super(props);

    this.state = {
      overallMarketValue: 0,
      originalPortfolio: STARTING_STOCK,
      desiredPortfolio: REBALANCE_STOCK,
      stockInfo: {}
    }
  }

  onCalculateButtonPress = () => {
    this.getRequiredStockDataForCurrentAndDesiredPortfolio();
  }

  onRebalanceButtonPress = () => {
    this.rebalancePortfolio();
  }

  getRequiredStockDataForCurrentAndDesiredPortfolio = () => {
    // we make this a promise because we need to get the closing value (closeValue) so that we
    // can figure out the percentage of the stock in the portfolio.
    // the percentage of stock in portfolio is the market value of each stock (quantity * closing value)
    // divide by the overall market value

    return new Promise((resolve, reject) => {
      const { originalPortfolio, desiredPortfolio } = this.state;
      let originalPortfolioCounter: number = 0;
      let overallMarketValue: number = 0;
  
      originalPortfolio.map((item, index) => {
        const { symbol } = item;
        this.fetchStock(symbol)
          .then(() => {
            const { stockInfo } = this.state;
            const marketValue: number = Number((item.quantity * stockInfo[symbol].closeValue).toFixed(2));
            overallMarketValue = overallMarketValue + marketValue;
  
            item['marketValue'] = marketValue;
            originalPortfolio[index] = item;
  
            // the market value for each stock and tallied overall market value
            console.log(
              `${symbol}:: ${item.quantity} * ${stockInfo[symbol].closeValue} = ${marketValue}`,
              `Overall Market Value = ${overallMarketValue}`
            );
  
            originalPortfolioCounter++;
            if (originalPortfolioCounter === originalPortfolio.length) {
              this.setState({ overallMarketValue, originalPortfolio }, () => this.calculatePercentageOfPortfolio());

              let desiredPortfolioCounter = 0;
  
              desiredPortfolio.map((item, index) => {
                // we might as well start getting data about stocks in our desired portfolio.
                this.fetchStock(item.symbol)
                  .then(() => {
                    desiredPortfolioCounter++;
                    if (desiredPortfolioCounter === desiredPortfolio.length) {
                      resolve();
                    }
                  })
                  .catch((err) => {
                    console.log(err);
                    reject(err);
                  });
              });
            }
          })
          .catch((err) => {
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
        fetch(`https://www.alphavantage.co/query?apikey=${ALPHA_ADVANTAGE_API_KEY}&function=TIME_SERIES_DAILY_ADJUSTED&symbol=${symbol}`, {
          method: 'GET'
        })
          .then((response) => response.json())
          .then((responseJson) => {
            // console.log(responseJson);
            const lastRefreshed: string = responseJson['Meta Data']['3. Last Refreshed'].split(' ')[0];
            const latestFromTimeSeries: string = responseJson['Time Series (Daily)'][`${lastRefreshed}`];
            const closeValue: number = Number(responseJson['Time Series (Daily)'][`${lastRefreshed}`]['4. close']);
  
            stockInfo[symbol] = { closeValue };
            this.setState({ stockInfo }, () => resolve());
          })
          .catch((err) => {
            reject(err);
          })
      }
    })
  }

  calculatePercentageOfPortfolio = () => {
    const { originalPortfolio, overallMarketValue } = this.state;

    originalPortfolio.map((item, index) => {
      item['percentageOfPortfolio'] = item.marketValue / overallMarketValue * 100;
      originalPortfolio[index] = item;

      this.setState({ originalPortfolio });
    })
  }

  rebalancePortfolio = () => {
    // 1. we need to know the current percentage of stocks in our portfolio
    this.getRequiredStockDataForCurrentAndDesiredPortfolio()
      .then(() => {
        // 2. go through original portfolio and trade based on if the desired portfolio
        // requires the stock to added, traded away, or dump completely.
        const { desiredPortfolio, originalPortfolio, stockInfo, overallMarketValue } = this.state;
        let newPortfolio = originalPortfolio;
        const originalOverallMarketValue = overallMarketValue;
        let newOverallMarketValue = overallMarketValue;
    
        originalPortfolio.map((item, index) => {
          const { symbol, percentageOfPortfolio, quantity, marketValue } = item;
          const { closeValue } = stockInfo[symbol];
          let deltaQuantity = 0;
          let newQuantity   = 0;
          let newPercentageOfPortfolio = 0;
          let newMarketValue = 0;
    
          const currentDesiredStock = desiredPortfolio.find((x) => x.symbol === symbol);
          if (typeof currentDesiredStock === 'undefined') {
            // dump all for stocks that are not in the desired portfolio
            deltaQuantity = -(item.quantity);
            newOverallMarketValue = newOverallMarketValue - marketValue;
            newQuantity = 0;
          } else {
            // trade existing stocks to the new percentage of portfolio based
            // on the original overall market value
            const deltaPercentageOfPortfolio = currentDesiredStock.percentageOfPortfolio - percentageOfPortfolio;
            deltaQuantity = this.calculateDeltaQuantityFromDeltaPercentage(
              (deltaPercentageOfPortfolio / 100),
              originalOverallMarketValue,
              closeValue
            );

            // deltaQuantity can be a positive or negative integer. Buy === positive, Sell === negative
            newQuantity = quantity + deltaQuantity;
            newMarketValue = (newQuantity * closeValue)
            newOverallMarketValue = newOverallMarketValue - marketValue + newMarketValue;
            newPercentageOfPortfolio = newQuantity * closeValue * 100 / originalOverallMarketValue;
          }

          newPortfolio[index] = this.createStockData({
            symbol,
            quantity: newQuantity,
            deltaQuantity,
            marketValue: newMarketValue,
            percentageOfPortfolio: newPercentageOfPortfolio
          });

          console.log(newOverallMarketValue);
        });
    
        desiredPortfolio.map((item, index) => {
          const { symbol, percentageOfPortfolio } = item;
          const existingStock = originalPortfolio.find((x) => x.symbol === symbol);
          if (typeof existingStock === 'undefined') {
            const newQuantity = this.calculateDeltaQuantityFromDeltaPercentage(
              (percentageOfPortfolio / 100),
              overallMarketValue,
              stockInfo[symbol].closeValue);
              
            const newMarketValue = newQuantity * stockInfo[symbol].closeValue;
            console.log(`${newQuantity} * ${stockInfo[symbol].closeValue} = ${newMarketValue}`);
            newOverallMarketValue = newOverallMarketValue + newMarketValue;
            newPortfolio.push(
              this.createStockData({
                symbol, 
                quantity: newQuantity, 
                deltaQuantity: newQuantity, 
                marketValue: newMarketValue,
                percentageOfPortfolio: (newMarketValue / overallMarketValue) * 100,
              }));
          }
        });
    
        console.log(newPortfolio, newOverallMarketValue - originalOverallMarketValue);
        this.setState({ originalPortfolio: newPortfolio });
      });
  }

  createStockData = (props: PortfolioProps) => {
    // symbol: string, quantity: number, deltaQuantity: number, marketValue: number, percentageOfPortfolio: number
    const { symbol, quantity, deltaQuantity, marketValue, percentageOfPortfolio } = props;
    return { symbol, quantity, deltaQuantity, marketValue, percentageOfPortfolio };
  }

  calculateDeltaQuantityFromDeltaPercentage = (percentageOfPortfolio: number, overallMarketValue: number, closeValue: number) => {
    // console.log(Math.floor(percentageOfPortfolio * overallMarketValue / closeValue), this.roundDown((percentageOfPortfolio * overallMarketValue / closeValue), 0));
    return Math.floor(percentageOfPortfolio * overallMarketValue / closeValue);
  }

  roundDown = (value: number, decimals: number) => {
    return Number(Math.round(value * 10**decimals) / 10**decimals);
  }

  keyExtractor = (item: { symbol: string }, index:number) => item.symbol;
  
  renderRow = (rowData: { item: PortfolioProps }) => {
    const { symbol, quantity, deltaQuantity, percentageOfPortfolio, marketValue } = rowData.item;
    const { stockInfo } = this.state;
    let closeValue = 0.00;
    if (typeof stockInfo[symbol] !== 'undefined') closeValue = stockInfo[symbol].closeValue; 

    return (
      <TouchableHighlight
        onPress={() => console.log('pressed')}
        style={{ flex: 1, borderColor: '#000000', borderWidth: 1 }}
      >
        <View>
          <View style={{ flex: 1, flexDirection: 'row', padding: 5 }}>
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
        </View>
      </TouchableHighlight>
    )
  }

  renderDeltaQuantity = (deltaQuantity: number) => {
    if (deltaQuantity > 0) {
      return (<Text style={{ color: 'green' }}>({deltaQuantity})</Text>);
    } else if (deltaQuantity < 0) return ( <Text style={{ color: 'red' }}>({deltaQuantity})</Text>);

    return (<Text>({deltaQuantity})</Text>);
  }
  
  render() {
    return (
      <View style={styles.container}>
        <View style={{ height: 100 }} />
        <FlatList
          data={this.state.originalPortfolio}
          extraData={this.state}
          renderItem={(rowData) => this.renderRow(rowData)}
          keyExtractor={this.keyExtractor}
          style={{ flex: 1, alignSelf: 'stretch' }}
        />

        <Text>{(this.state.overallMarketValue).toFixed(2)}</Text>

        <Button title={'CALCULATE'} onPress={() => this.onCalculateButtonPress()} color={'red'} />
        <Button title={'REBALANCE'} onPress={() => this.onRebalanceButtonPress()} color={'red'} />

        <FlatList
          data={REBALANCE_STOCK}
          renderItem={(rowData) => this.renderRow(rowData)}
          keyExtractor={this.keyExtractor}
          style={{ flex: 1, alignSelf: 'stretch' }}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
