# AUTOGENERATED! DO NOT EDIT! File to edit: ../nbs/01_notion.ipynb.

# %% auto 0
__all__ = ['NotionApiClient']

# %% ../nbs/01_notion.ipynb 3
import os
from dotenv import load_dotenv
import json
from tqdm import tqdm
import requests

# %% ../nbs/01_notion.ipynb 4
class NotionApiClient:
    def __init__(self): # , token
        # .envファイルの内容を読み込見込む
        load_dotenv()

        api_key = os.environ["notion_api_key"]

        self.api_key = api_key

    @staticmethod
    def run():
        self = NotionApiClient()
        self.main()

    def main(self):
        database_id = "6f898ed1352e4c9fa013eee635cbabf4"
        self.database_id = database_id

        with open("theme_metadata.json", "r") as f:
            metadata = json.load(f)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "Notion-Version": "2021-08-16"
        }

        self.headers = headers

        self.insert_or_update_page(metadata)

    def insert_or_update_page(self, metadata, verbose=False):
        database_id = self.database_id
        headers = self.headers

        for item in tqdm(metadata):

            url = item["url"]
            name = item["name"]
            stars = item["stars"]

            updated_at = item["last_updated"]

            updated_at = updated_at.split("T")[0] # .replace("-", "/")

            # データベース検索用のURLとヘッダー
            search_url = f"https://api.notion.com/v1/databases/{database_id}/query"

            # 検索条件
            search_data = {
                "filter": {
                    "property": "URL",
                    "text": {
                        "equals": url
                    }
                }
            }

            # データベースを検索
            search_response = requests.post(search_url, json=search_data, headers=headers)
            search_results = search_response.json()

            params = {
                "properties": {
                    # 更新するプロパティ
                    "name": {
                        "title": [
                            {
                                "text": {
                                    "content": name
                                }
                            }
                        ]
                    },
                    "stars": {
                        "number": stars
                    },
                    "URL": {
                        "url": url
                    },
                    "last_updated": {
                        "date": {
                            "start": updated_at
                        }
                    }
                }
            }

            if "description" in item and item["description"]:
                params["properties"]["description"] = {
                    "rich_text": [
                        {
                            "text": {
                                "content": item["description"]
                            }
                        }
                    ]
                }

            if "theme_url" in item:
                params["properties"]["thumbnail"] = {
                    "files": [
                        {
                            "name": "theme.jpg",
                            "type": "external",
                            "external": {
                                "url": item["theme_url"]
                            }
                        }
                    ]
                }

            # アイテムが存在するか確認
            if search_results["results"]:
                # アイテムが存在する場合
                page_id = search_results["results"][0]["id"]  # 最初のアイテムのIDを取得
                update_url = f"https://api.notion.com/v1/pages/{page_id}"

                

                # アイテムを更新
                update_response = requests.patch(update_url, json=params, headers=headers)

                if verbose:
                    print("アイテムを更新しました。", update_response.json())
            else:
                # アイテムが存在しない場合
                create_url = "https://api.notion.com/v1/pages"

                # 新しく作成するデータ
                create_data = {
                    "parent": { "database_id": database_id },
                    "properties": params
                }

                # 新しいアイテムを作成
                create_response = requests.post(create_url, json=create_data, headers=headers)

                if verbose:
                    print("新しいアイテムを作成しました。", create_response.json())
        # pass
                
    def delete_page(self, verbose=False):
        database_id = self.database_id
        headers = self.headers

        # データベース検索用のURLとヘッダー
        search_url = f"https://api.notion.com/v1/databases/{database_id}/query"

        # URLフィールドが空のページを検索するクエリ
        data = {
            "filter": {
                "and": [
                    {
                        "property": "URL",
                        "url": {
                            "is_empty": True
                        }
                    }
                ]
            }
        }

        # データベースを検索
        response = requests.post(search_url, json=data, headers=headers)
        pages = response.json().get("results", [])

        # 各ページを削除
        for page in pages:
            page_id = page["id"]
            delete_url = f"https://api.notion.com/v1/pages/{page_id}"

            params = {
                "archived": True
            }

            update_response = requests.patch(delete_url, json=params, headers=headers)

            if verbose:
                print("アイテムを更新しました。", update_response.json())
