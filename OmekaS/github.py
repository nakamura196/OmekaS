# AUTOGENERATED! DO NOT EDIT! File to edit: ../nbs/00_github.ipynb.

# %% auto 0
__all__ = ['GitHubApiClient']

# %% ../nbs/00_github.ipynb 3
import pandas as pd
# 必要モジュールのインポート
import os
from dotenv import load_dotenv
import requests
from tqdm import tqdm
import json

# %% ../nbs/00_github.ipynb 4
class GitHubApiClient:
    def __init__(self): # , token
        # .envファイルの内容を読み込見込む
        load_dotenv()

        token = os.environ["token"]

        self.token = token
        # pass

    @staticmethod
    def run():
        self = GitHubApiClient()
        self.load_csv("https://raw.githubusercontent.com/Daniel-KM/UpgradeToOmekaS/master/_data/omeka_s_themes.csv")
        self.create_metadata()

    def load_csv(self, url):

        df = pd.read_csv(url, sep=',', header=0, index_col=0, encoding='utf-8')

        self.df = df

    def create_metadata(self):
        df = self.df

        # 'url'列の値を配列として取得
        repository_urls = df['Url'].to_list()

        result = []

        for repository_url in tqdm(repository_urls):
            owner = repository_url.split("/")[-2]
            repo = repository_url.split("/")[-1]
            

            api_repo = f'https://api.github.com/repos/{owner}/{repo}'

            metadata = self.get_metadata(api_repo)

            if metadata is None:
                continue

            theme_url = self.get_theme_url(api_repo)

            if theme_url is not None:
                metadata["theme_url"] = theme_url

            result.append(metadata)

        with open('theme_metadata.json', 'w') as f:
            json.dump(result, f, indent=4, ensure_ascii=False)

    def get_theme_url(self, api_repo): # , api_repo
        path = "theme.jpg"
        token = self.token
        # api_repo = self.api_repo

        response = requests.get(f'{api_repo}/contents/{path}',
                                headers={'Authorization': f'token {token}'})
        
        if response.status_code == 200:
            return response.json()["download_url"]
        else:
            return None
        
    def get_metadata(self, api_repo, verbose=False):
        token = self.token

        verbose = False

        if verbose:
            print(f'Fetching metadata for {api_repo}')

        response = requests.get(f'{api_repo}',
            headers={'Authorization': f'token {token}'})

        if response.status_code == 500:
            return None
        
        data = response.json()

        if verbose:
            print(data)

        if "message" in data and data["message"] == "Not Found":
            return None

        last_updated = None

        # 最終更新日とスター数の取得
        if "updated_at" in data:
            
            last_updated = data['updated_at']
        
        stars = None

        if "stargazers_count" in data:
            stars = data['stargazers_count']

        name = data['name']

        url = data['html_url']

        description = data['description']

        return {
            "name": name,
            "last_updated": last_updated,
            "stars": stars,
            "url": url,
            "description": description
        }

    def __repr__(self):
        return f'Client({self.name})'
