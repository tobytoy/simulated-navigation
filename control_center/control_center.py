import streamlit as st
import os
import json
from supabase import create_client, Client
import psycopg2
import pandas as pd
from dotenv import load_dotenv

# 設定頁面配置與美化主題
st.set_page_config(
    page_title="MOTC 模擬控制中心",
    page_icon="🚦",
    layout="wide"
)

# 載入環境變數
current_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(current_dir, "../.env")
load_dotenv(env_path)

# 讀取憑證
supabase_url = os.environ.get("VITE_SUPABASE_URL")
# 後端通常使用 Secret Key / Service Role Key 進行操作，若無則回退至 Anon Key
supabase_key = os.environ.get("SUPABASE_SECRET_KEY")
if not supabase_key or "金鑰" in supabase_key:
    supabase_key = os.environ.get("VITE_SUPABASE_ANON_KEY")

database_url = os.environ.get("DATABASE_URL")

st.title("🚦 MOTC 台灣即時路況導航模擬器 - 控制與管理中心")
st.markdown("""
本控制面板是模擬器的**營運後台**。您可以一鍵初始化 Supabase 靜態地圖資料、使用 SQL 直接更新路段狀態，並發布即時路況事件。
* 前端模擬器將會即時接收到此處產生的變更並進行語音播報。
""")

# 側邊欄：連線設定與狀態
st.sidebar.header("🔌 連線狀態與設定")
st.sidebar.markdown(f"**Supabase URL:** `{supabase_url}`")
if supabase_key:
    st.sidebar.success("Supabase API Key 已載入")
else:
    st.sidebar.error("Supabase API Key 遺失，請檢查 .env")

# 允許自訂連線字串
db_url_input = st.sidebar.text_input(
    "PostgreSQL Database URL", 
    value=database_url or "", 
    placeholder="postgresql://postgres:[password]@...",
    type="password",
    help="執行 SQL 命令直連資料庫所需，可從 Supabase -> Settings -> Database -> Connection string (URI) 複製"
)

# 初始化 Supabase 用戶端
@st.cache_resource
def get_supabase_client(url, key) -> Client:
    return create_client(url, key)

try:
    sb: Client = get_supabase_client(supabase_url, supabase_key)
except Exception as e:
    st.error(f"無法初始化 Supabase 客戶端: {e}")
    st.stop()

# 建立分頁標籤
tab1, tab2, tab3 = st.tabs(["📂 靜態資料管理器", "⚡ 動態路況發布中心", "💻 SQL 終端機"])

# =========================================================================
# TAB 1: 靜態資料管理器
# =========================================================================
with tab1:
    st.header("📂 靜態圖資資料庫管理")
    st.markdown("檢視目前 Supabase 資料庫中的靜態路線、路段與固定式路標資料。")

    col1, col2 = st.columns([1, 3])

    with col1:
        st.subheader("⚙️ 資料庫操作")
        
        # 讀取本地的 JSON 檔案
        json_path = os.path.join(current_dir, "mock_static_data.json")
        try:
            with open(json_path, "r", encoding="utf-8") as f:
                mock_data = json.load(f)
            st.info("已成功讀取本地的 `mock_static_data.json` 圖資檔案")
        except Exception as e:
            st.error(f"讀取本地圖資檔案失敗: {e}")
            mock_data = None

        if st.button("🚀 一鍵初始化 / 重設 Supabase 靜態資料", width="stretch", type="primary"):
            if not mock_data:
                st.error("沒有可上傳的資料。")
            else:
                progress = st.progress(0)
                status_text = st.empty()

                try:
                    # 1. 寫入路線資料
                    status_text.text("正在上傳靜態路線資料...")
                    for r in mock_data.get("routes", []):
                        sb.table("static_routes").upsert({
                            "name": r["name"],
                            "description": r["description"],
                            "checkpoints": r["checkpoints"]
                        }).execute()
                    progress.progress(33)

                    # 2. 寫入路段資料
                    status_text.text("正在上傳靜態路段資料...")
                    for s in mock_data.get("segments", []):
                        sb.table("static_segments").upsert({
                            "id": s["id"],
                            "name": s["name"],
                            "coordinates": s["coordinates"],
                            "status": s["status"],
                            "speed_limit": s["speed_limit"],
                            "average_speed": s["average_speed"]
                        }).execute()
                    progress.progress(66)

                    # 3. 寫入測速照相資料
                    status_text.text("正在上傳固定式測速照相與路標資料...")
                    for l in mock_data.get("landmarks", []):
                        sb.table("static_landmarks").upsert({
                            "id": l["id"],
                            "type": l["type"],
                            "title": l["title"],
                            "description": l["description"],
                            "latitude": l["latitude"],
                            "longitude": l["longitude"],
                            "road_name": l["road_name"],
                            "speed_limit": l["speed_limit"]
                        }).execute()
                    progress.progress(100)

                    status_text.empty()
                    st.success("Supabase 靜態資料初始化成功！地圖圖資已重置。")
                except Exception as e:
                    status_text.empty()
                    st.error(f"資料初始化過程發生錯誤: {e}\n請確認 Supabase 中的資料表已成功建立。")

    with col2:
        st.subheader("📊 資料庫表格檢視")
        sub_tab1, sub_tab2, sub_tab3 = st.tabs(["🛤️ 路線 (Routes)", "🚗 路段狀態 (Segments)", "📸 測速與路標 (Landmarks)"])

        with sub_tab1:
            try:
                routes_res = sb.table("static_routes").select("name, description, checkpoints").execute()
                if routes_res.data:
                    st.dataframe(pd.DataFrame(routes_res.data), width="stretch")
                else:
                    st.warning("資料庫中無路線資料，請點擊左側初始化按鈕。")
            except Exception as e:
                st.error(f"讀取資料表失敗: {e}")

        with sub_tab2:
            try:
                segments_res = sb.table("static_segments").select("id, name, status, speed_limit, average_speed").execute()
                if segments_res.data:
                    st.dataframe(pd.DataFrame(segments_res.data), width="stretch")
                else:
                    st.warning("資料庫中無路段資料，請點擊左側初始化按鈕。")
            except Exception as e:
                st.error(f"讀取資料表失敗: {e}")

        with sub_tab3:
            try:
                landmarks_res = sb.table("static_landmarks").select("id, title, description, road_name, speed_limit").execute()
                if landmarks_res.data:
                    st.dataframe(pd.DataFrame(landmarks_res.data), width="stretch")
                else:
                    st.warning("資料庫中無路標資料，請點擊左側初始化按鈕。")
            except Exception as e:
                st.error(f"讀取資料表失敗: {e}")


# =========================================================================
# TAB 2: 動態路況發布中心
# =========================================================================
with tab2:
    st.header("⚡ 實時路況動態警報模擬器")
    st.markdown("發佈或解除臨時性路況警告，React 前端將即時彈出事件標記並進行語音通知。")

    # 地標位置預設值方便快速點選
    presets = {
        "忠孝東路一段 (華山文創)": {"lat": 25.0445, "lng": 121.5215, "road": "忠孝東路一段 (靠近華山園區)"},
        "仁愛路三段 (建國高架旁)": {"lat": 25.0372, "lng": 121.5332, "road": "仁愛路三段快慢車道分割處"},
        "景福門圓環 (東門)": {"lat": 25.0392, "lng": 121.5186, "road": "景福門圓環周邊"},
        "建國高架 (信義路匝道前)": {"lat": 25.0395, "lng": 121.5371, "road": "建國高架道路 (南向)"},
        "中山南路 (台大醫院前)": {"lat": 25.0410, "lng": 121.5188, "road": "中山南路路段"},
        "仁愛路一段 (交通部大樓前)": {"lat": 25.0384, "lng": 121.5230, "road": "仁愛路一段 (往西向)"}
    }

    col1, col2 = st.columns([2, 3])

    with col1:
        st.subheader("📢 發佈新警報")
        
        # 預設位置點選
        preset_choice = st.selectbox("🎯 快速填入預設地點座標", ["自訂輸入"] + list(presets.keys()))
        
        # 表單欄位
        alert_type = st.selectbox("🚨 警報類型 (Type)", [
            ("accident", "🚗 車禍事故"),
            ("flooding", "🌧️ 道路淹水"),
            ("road_closure", "🚫 道路封閉"),
            ("construction", "🚧 道路施工"),
            ("congestion", "⏳ 嚴重擁堵")
        ], format_func=lambda x: x[1])

        title = st.text_input("📝 警報標題 (Title)", value="追撞事故車禍" if preset_choice == "自訂輸入" else f"{preset_choice.split('(')[0]} - 狀況回報")
        description = st.text_area("ℹ️ 警報詳細描述 (Description)", value="兩部自小客車發生追撞，佔用內側車道，請駕駛注意防衛性駕駛。")
        
        # 處理座標
        default_lat = 25.0384
        default_lng = 121.5230
        default_road = "仁愛路一段"
        if preset_choice != "自訂輸入":
            default_lat = presets[preset_choice]["lat"]
            default_lng = presets[preset_choice]["lng"]
            default_road = presets[preset_choice]["road"]

        c_lat = st.number_input("📍 緯度 Latitude", value=default_lat, format="%.5f")
        c_lng = st.number_input("📍 經度 Longitude", value=default_lng, format="%.5f")
        road_name = st.text_input("🛣️ 路段名稱 (Road Name)", value=default_road)

        severity = st.select_slider("🔥 嚴重程度 (Severity)", options=["low", "medium", "high"], value="high")

        if st.button("📡 發佈即時路況警報到 Supabase", width="stretch", type="primary"):
            try:
                # 寫入 Supabase
                res = sb.table("dynamic_alerts").insert({
                    "type": alert_type[0],
                    "title": title,
                    "description": description,
                    "latitude": c_lat,
                    "longitude": c_lng,
                    "road_name": road_name,
                    "severity": severity,
                    "is_active": True
                }).execute()
                st.success(f"警報「{title}」發佈成功！前端模擬器即將開始播報。")
            except Exception as e:
                st.error(f"發佈警報失敗: {e}")

    with col2:
        st.subheader("🔥 當前活躍中的即時警報")
        
        try:
            # 撈取目前 is_active = True 的警報
            alerts_res = sb.table("dynamic_alerts").select("*").eq("is_active", True).order("created_at", desc=True).execute()
            
            if not alerts_res.data:
                st.info("目前沒有任何活躍中的動態路況警報。")
            else:
                for idx, alert in enumerate(alerts_res.data):
                    with st.container(border=True):
                        col_a, col_b = st.columns([4, 1])
                        with col_a:
                            st.markdown(f"### {alert['title']} (`{alert['type']}`) [{alert['severity'].upper()}]")
                            st.markdown(f"**路段**：{alert['road_name']} (緯度: `{alert['latitude']}`, 經度: `{alert['longitude']}`)")
                            st.markdown(f"**詳細描述**：{alert['description']}")
                            st.caption(f"發佈時間：{alert['created_at']}")
                        with col_b:
                            st.markdown("<br>", unsafe_allow_html=True)
                            # 解除警報 (將 is_active 改為 False)
                            if st.button("❌ 解除", key=f"del_{alert['id']}", width="stretch"):
                                try:
                                    sb.table("dynamic_alerts").update({
                                        "is_active": False,
                                        "ended_at": "now()"
                                    }).eq("id", alert["id"]).execute()
                                    st.success("已解除警報！")
                                    st.rerun()
                                except Exception as e:
                                    st.error(f"解除失敗: {e}")
        except Exception as e:
            st.error(f"讀取動態警報失敗: {e}")


# =========================================================================
# TAB 3: SQL 終端機
# =========================================================================
with tab3:
    st.header("💻 SQL 資料庫終端機 (SQL Executer)")
    st.markdown("直接輸入 SQL 指令對 Supabase 資料庫進行查詢或修改（如快速更新路段速限、狀態等）。")

    if not db_url_input:
        st.warning("⚠️ 請先在側邊欄輸入 **PostgreSQL Connection String (Database URL)** 才能連線執行 SQL。")
    else:
        sql_input = st.text_area(
            "請輸入 SQL 語句", 
            value="-- 修改中山南路速限為 60 的範例\n-- UPDATE static_segments SET speed_limit = 60 WHERE id = 'seg_2';\n\nSELECT * FROM static_segments;",
            height=150
        )

        col1, col2 = st.columns([1, 5])
        
        with col1:
            run_sql = st.button("⚡ 執行 SQL 指令", width="stretch", type="primary")
            
        with col2:
            st.caption("按 Ctrl+Enter 也可以快速執行")

        if run_sql and sql_input:
            try:
                # 建立 PostgreSQL 直連
                conn = psycopg2.connect(db_url_input)
                cur = conn.cursor()
                
                # 執行指令
                cur.execute(sql_input)
                
                # 判斷是否為查詢語句
                if cur.description:
                    columns = [desc[0] for desc in cur.description]
                    data = cur.fetchall()
                    conn.commit()
                    
                    df_res = pd.DataFrame(data, columns=columns)
                    st.success(f"執行成功！共獲取 {len(df_res)} 筆資料。")
                    st.dataframe(df_res, width="stretch")
                else:
                    # 修改語句 (Update/Delete/Insert)
                    conn.commit()
                    st.success(f"指令執行成功！影響了 {cur.rowcount} 行資料。")
                    
                cur.close()
                conn.close()
            except Exception as e:
                st.error(f"執行 SQL 發生錯誤: {e}")
