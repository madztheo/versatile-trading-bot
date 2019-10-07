# Versatile Trading Bot

A versatile trading bot which can be connected to different brokers and which can use different strategies. The project has been built with NodeJS and is coded in TypeScript.

## About the strategy used

The Ichimoku Strategy has been tested for some time (1 hour candle) and is not fully profitable. But it is not entirely unprofitable either. I suspect most of the improvement should be made on the stop loss and exit strategy. The winning trades have totaled a higher absolute average than the losing ones but the losing ones are more common impacting the strategy efficiency.

## Brokers implemented

There are 2 brokers (or exchanges) implementation in this project so far: Oanda (a FOREX and commodities broker) and Coinbase Pro (a cryptocurrency exchange). The implementation for Oanda is more rigorous and thoroughly tested than the one for Coinbase. I do not advise its use for Coinbase as is, improvements should be made beforehand.

## Technical notes

The project still uses Promises, so one technical improvement that could be done is switching to async/await when possible. And make yourself aware of all the environment variables that need to be set before using this project.

## Tests

Run `npm test` to execute the tests. This project uses Jest for testing with ts-jest to support TypeScript.
The tests are based on sample data extracted from Oanda API.

## Disclaimer

You are free to use or fork this project as well as suggest improvements. However, I am not liable for any loss that the use of this algorithm may incur. Keep in mind that your capital is at risk while investing in markets such as the FOREX or cryptocurrencies.
