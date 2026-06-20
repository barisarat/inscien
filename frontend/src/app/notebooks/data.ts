// src/app/notebooks/data.ts

export type Category =
  | "Quantitative Finance"
  | "Market Microstructure"
  | "Information Retrieval"
  | "NLP and Text Analysis"
  | "Remote Sensing"
  | "Data Sources and APIs"
  | "Data Science Workflows"
  | "Machine Learning Models"
  | "Statistics and Evaluation"
  | "Python and Coding"
  | "Research Tools and Workflows"

export interface NotebookEntry {
  id:       string
  name:     string
  desc:     string
  category: Category
}

export const notebooks: NotebookEntry[] = [
  { id: "macro-dashboard",              name: "U.S. Macro Analysis",                                desc: "Key U.S. macroeconomic indicators from FRED: interest rates and yield curve dynamics, inflation measures, real GDP growth and labor market conditions, and federal debt trends.", category: "Quantitative Finance" },
  { id: "market-returns",               name: "S&P 500 Long-Term Performance",                      desc: "S&P 500 annual return history, loss probability by holding period, rolling volatility with calibrated regime bands, multi-window Sharpe ratios, and bootstrap 5-year forward interval.", category: "Quantitative Finance" },
  { id: "nasdaq-company-analysis",      name: "Company Analysis",                                   desc: "Volatility, earnings impact, profitability, and risk analysis for major NASDAQ listed companies: AAPL, NVDA, GOOGL, MSFT, META.", category: "Quantitative Finance" },
  { id: "bootstrap-sp500-returns",      name: "S&P 500 Uncertainty with Bootstrap",                  desc: "A walkthrough of bootstrap resampling using real S&P 500 data. Constructing historical return distribution with 1,000 simulated 5-year paths, and uncertainty bands without parametric assumptions.", category: "Quantitative Finance" },
  { id: "technical-strategy-backtests", name: "Technical Strategy Backtests",                        desc: "A combined strategy notebook comparing ATR Exit, Bollinger Band Breakout, Simple Moving Average Crossover, and Oversold Mean-Reversion across ten large-cap NASDAQ stocks, with equal-weight buy-and-hold and QQQ as baselines.", category: "Quantitative Finance" },
  { id: "bet-against-beta",             name: "Bet Against Beta Strategy",                           desc: "An empirical test of the Frazzini & Pedersen (2014) BAB factor on NASDAQ stocks. Compares risk-adjusted returns across beta buckets and against QQQ buy-and-hold.", category: "Quantitative Finance" },
  { id: "vixy-hedge",                   name: "Selective VIXY Hedge Strategy",                       desc: "A hedged equity strategy that holds ten large-cap NASDAQ stocks long at all times and selectively adds a VIXY position during volatility spikes. Compared against equal-weight buy-and-hold and QQQ.", category: "Quantitative Finance" },
  { id: "dubai-rent-yields",            name: "Dubai Rent Yields by Area",                          desc: "Project level rental yield estimation, regional ROI comparison, and 10-year cumulative return projection using Dubai Land Department public transaction data.", category: "Quantitative Finance" },

  { id: "fi-2010",                      name: "FI-2010",                                            desc: "The standard benchmark dataset for limit order book mid-price movement prediction. Working on ten trading days of five Finnish stocks from the Helsinki Stock Exchange, reconstructed at 10 levels of depth with 144 features over five prediction horizons.", category: "Market Microstructure" },
  { id: "lobster",                      name: "LOBSTER",                                            desc: "Tick-level limit order book data reconstructed from NASDAQ's Historical TotalView ITCH feed. Working on sample data message stream and order book snapshots for each trading day, at up to 50 levels of depth.", category: "Market Microstructure" },
  { id: "binance-lob-data",             name: "Crypto LOB Data with Binance API",                    desc: "Live and historical cryptocurrency market data via Binance's public REST and WebSocket API. Covers spot order book snapshots, aggregated trades, and streaming depth updates at 100ms granularity.", category: "Market Microstructure" },

  { id: "multinews",                    name: "MultiNews",                                          desc: "Large-scale multi-document news summarisation dataset exploratory analysis. Widely used for summarisation, retrieval, and multi-document NLP research.", category: "Information Retrieval" },

  { id: "gdelt-topic-sentiment",                     name: "Topic Sentiment Index with GDELT",              desc: "Daily News Sentiment Index derived from GDELT news coverage across selected topics. Built from 15-minute GKG tiles with keyword relevance scoring with optimized download and retrieval pipeline.", category: "NLP and Text Analysis" },
  { id: "nlp-text-embedding-sentiment-reference",     name: "NLP Text Embedding and Sentiment Reference",     desc: "A practical NLP reference for article text cleaning, keyword filtering, VADER sentiment scoring, sentence embeddings, cosine similarity, and semantic search.", category: "NLP and Text Analysis" },
  { id: "article-fetching-text-extraction-reference", name: "Article Fetching and Text Extraction Reference", desc: "A practical reference for fetching article pages with requests, inspecting HTTP responses, extracting readable text and metadata with Trafilatura, and debugging failed URLs.", category: "NLP and Text Analysis" },

  { id: "earth-engine-satellite-features-reference",  name: "Earth Engine Satellite Features Reference",      desc: "A practical Earth Engine reference for loading GeoJSON regions, initializing with an EE project, extracting compact Sentinel-1 and Sentinel-2 satellite features, returning small values directly, and aligning weekly features in pandas.", category: "Remote Sensing" },

  { id: "fred",                         name: "FRED",                                               desc: "Federal Reserve Economic Data: over 800,000 U.S. and international macroeconomic time series from the Federal Reserve Bank of St. Louis. Covers interest rates, inflation, GDP, employment, trade, and commodity prices.", category: "Data Sources and APIs" },
  { id: "world-bank",                   name: "World Bank",                                         desc: "Open development data from the World Bank covering GDP, trade, poverty, health, and education indicators across countries and spanning decades. Accessible via the Data360 REST API, no authentication required.", category: "Data Sources and APIs" },
  { id: "brave-search",                 name: "Brave Search API",                                   desc: "Using the Brave Search API from Python: authentication, web search, and result parsing.", category: "Data Sources and APIs" },

  { id: "python-files-data-objects-reference",        name: "Python Files and Data Objects Reference",        desc: "A practical Python reference for pathlib paths, text files, JSON configs, NumPy arrays, reshape, hstack, vstack, NPZ, pickle, Parquet, CSV, and data export choices.", category: "Data Science Workflows" },

  { id: "knn-regression-reference",                   name: "KNN Regression Reference",                      desc: "A practical K-nearest neighbors regression reference using a small scikit-learn dataset. Covers scaling, train-test split, pipeline fitting, distance behavior, k-value comparison, evaluation metrics, and prediction examples.", category: "Machine Learning Models" },
  { id: "random-forest-regression-reference",         name: "Random Forest Regression Reference",            desc: "A practical Random Forest regression reference using a tabular scikit-learn dataset. Covers model training, evaluation metrics, feature importance, tree-depth behavior, prediction inspection, and saved comparison outputs.", category: "Machine Learning Models" },
  { id: "xgboost-regression-reference",               name: "XGBoost Regression Reference",                  desc: "A practical XGBoost regression reference using a tabular scikit-learn dataset. Covers boosted tree training, parameter meanings, evaluation metrics, feature importance, boosting-round comparison, and prediction examples.", category: "Machine Learning Models" },
  { id: "lstm-regression-reference",                  name: "LSTM Regression Reference",                     desc: "A practical LSTM regression reference using generated sequence data. Covers sequence tensor creation, PyTorch model definition, scaling, training loop, validation loss tracking, prediction, and saved outputs.", category: "Machine Learning Models" },
  { id: "arima-forecasting-reference",                name: "ARIMA Forecasting Reference",                   desc: "A practical ARIMA forecasting reference using a small time-series dataset with fallback data. Covers ordered splitting, ARIMA order selection, model fitting, rolling forecasts, forecast errors, and future prediction.", category: "Machine Learning Models" },

  { id: "python-statistical-tests-reference",         name: "Python Statistical Tests Reference",             desc: "A practical Python reference for paired observations, grouped metric summaries, Friedman tests, Wilcoxon signed-rank tests, Bonferroni correction, and model comparison tables.", category: "Statistics and Evaluation" },

  { id: "python-foundations",                         name: "Python Foundations Reference",                   desc: "A compact reference for foundational Python operations and concepts: variables, types, expressions, data structures, functions, NumPy, and Pandas.", category: "Python and Coding" },

  { id: "citation-retriever",                         name: "Citation Retriever for BibTeX",                  desc: "Parse a .bib file, resolve citation counts from the Semantic Scholar API, and produce a ranked summary of your bibliography.", category: "Research Tools and Workflows" },
  { id: "playwright-screenshots",                     name: "Playwright Screenshots",                         desc: "Capture high-fidelity screenshots of selected web pages using headless Chromium from a notebook cell.", category: "Research Tools and Workflows" },
  { id: "transcribe-podcast",                         name: "Podcast Transcription",                          desc: "Fetch a podcast episode from an RSS feed, transcribe locally with Whisper, and organize the output into a structured Markdown file using a local LLM.", category: "Research Tools and Workflows" },
]

export const CATEGORY_ORDER: Category[] = [
  "Quantitative Finance",
  "Market Microstructure",
  "Information Retrieval",
  "NLP and Text Analysis",
  "Remote Sensing",
  "Data Sources and APIs",
  "Data Science Workflows",
  "Machine Learning Models",
  "Statistics and Evaluation",
  "Python and Coding",
  "Research Tools and Workflows",
]

export function getNotebook(id: string): NotebookEntry | undefined {
  return notebooks.find((n) => n.id === id)
}



export function sidebarItemsForCategory(cat: Category) {
  return notebooksByCategory(cat).map((n) => ({
    label: n.name,
    href:  `/notebooks/${n.id}`,
  }))
}

export function sidebarItemsForAllNotebooks() {
  return notebooks.map((n) => ({
    label: n.name,
    href: `/notebooks/${n.id}`,
  }))
}

export function notebookBasename(id: string): string {
  return id.replace(/-/g, "_")
}



export function notebooksByCategory(cat: Category): NotebookEntry[] {
  return notebooks.filter((n) => n.category === cat)
}
