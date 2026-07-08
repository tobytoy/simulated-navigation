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

# 建立功能分頁（使用 sidebar radio 隔離執行上下文，防止跨頁狀態串場）
page = st.sidebar.radio(
    "📋 選擇功能分頁",
    ["📂 靜態資料管理器", "⚡ 動態路況發布中心", "💻 SQL 終端機", "📍 跨路網分析"]
)

# =========================================================================
# TAB 1: 靜態資料管理器
# =========================================================================
if page == "📂 靜態資料管理器":
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
if page == "⚡ 動態路況發布中心":
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
if page == "💻 SQL 終端機":
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


# =========================================================================
# TAB 4: 跨路網分析 (OSMnx Route Planner)
# =========================================================================
if page == "📍 跨路網分析":
    st.header("📍 OSMnx 跨路網分析規劃器")
    st.markdown("輸入任意起訖地名（如「台北101」、「東門站」），利用 OpenStreetMap 進行真實道路拓撲之最短路徑計算（人行、車行、自行車），並即時發佈至 Supabase！")

    col1, col2 = st.columns([2, 3])

    with col1:
        st.subheader("🗺️ 設定起訖點與路網模式")
        start_addr = st.text_input("🟢 起點地標/地址 (Start)", value="台北101")
        end_addr = st.text_input("🏁 終點地標/地址 (Destination)", value="中正紀念堂")
        
        mode_choice = st.selectbox("🚶/🚗/🚲 移動模式 (Mode)", [
            ("drive", "🚗 汽車道路 (Drive)"),
            ("walk", "🚶 步行專用 (Walk)"),
            ("bike", "🚲 自行車道 (Bike)")
        ], format_func=lambda x: x[1])

        st.info("💡 第一次計算新地點時，系統需要下載 OpenStreetMap 地圖拓撲（約需 10-20 秒）。後續計算相同區域會加速。")
        
        run_analysis = st.button("⚡ 開始計算路網最短路徑", width="stretch", type="primary")

    with col2:
        st.subheader("📊 規劃路徑結果")
        if run_analysis:
            if not start_addr or not end_addr:
                st.error("請輸入起點與終點名稱。")
            else:
                with st.spinner("正在進行地理編碼 (Geocoding)..."):
                    try:
                        import osmnx as ox
                        import networkx as nx
                        import pandas as pd
                        
                        # 1. Geocode locations
                        start_coords = ox.geocode(start_addr)
                        end_coords = ox.geocode(end_addr)
                        
                        st.success(f"📍 解析成功！\n- 起點「{start_addr}」: {start_coords}\n- 終點「{end_addr}」: {end_coords}")
                        
                        # Save coords for calculation
                        start_lat, start_lng = start_coords
                        end_lat, end_lng = end_coords
                        
                    except Exception as e:
                        st.error(f"地理編碼解析失敗 (找不到該地標): {e}")
                        st.stop()

                with st.spinner("正在下載並建構 OpenStreetMap 道路拓撲網路..."):
                    try:
                        # Compute center point and bounding box diameter
                        center_lat = (start_lat + end_lat) / 2
                        center_lng = (start_lng + end_lng) / 2
                        
                        # Haversine distance to decide buffer size
                        import math
                        def get_dist(la1, lo1, la2, lo2):
                            R = 6371e3
                            phi1 = la1 * math.pi / 180
                            phi2 = la2 * math.pi / 180
                            dphi = (la2 - la1) * math.pi / 180
                            dlam = (lo2 - lo1) * math.pi / 180
                            a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlam/2)**2
                            c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                            return R * c
                        
                        dist_between = get_dist(start_lat, start_lng, end_lat, end_lng)
                        # Add a 1000m padding to ensure both points are inside the graph
                        buffer_dist = max(1500.0, dist_between / 2 + 1000.0)
                        
                        # Adjust graph network type based on mode selection
                        osm_network_type = "drive"
                        if mode_choice[0] == "walk":
                            osm_network_type = "walk"
                        elif mode_choice[0] == "bike":
                            osm_network_type = "bike"
                            
                        # Download graph
                        st.write(f"正在載入中心點周邊 {round(buffer_dist)} 公尺範圍內之 '{osm_network_type}' 路網...")
                        G = ox.graph_from_point((center_lat, center_lng), dist=buffer_dist, network_type=osm_network_type)
                    except Exception as e:
                        st.error(f"OSM 路網拓撲下載失敗: {e}\n請確認您是否連線網際網路，或是中心點座標在 OSM 覆蓋範圍內。")
                        st.stop()

                with st.spinner("正在進行最短路徑演算法 (Dijkstra) 計算..."):
                    try:
                        # 2. Find nearest node to start/end
                        start_node = ox.nearest_nodes(G, start_lng, start_lat)
                        end_node = ox.nearest_nodes(G, end_lng, end_lat)
                        
                        # 3. Calculate shortest path using length weight
                        path_nodes = nx.shortest_path(G, start_node, end_node, weight="length")
                        
                        # 4. Extract path coordinates
                        path_coords = [[G.nodes[node]['y'], G.nodes[node]['x']] for node in path_nodes]
                        
                        # Calculate total distance
                        total_dist_meters = sum(
                            get_dist(
                                G.nodes[path_nodes[i]]['y'], G.nodes[path_nodes[i]]['x'],
                                G.nodes[path_nodes[i+1]]['y'], G.nodes[path_nodes[i+1]]['x']
                            ) for i in range(len(path_nodes)-1)
                        )
                        
                        # Estimate travel duration
                        speed_mps = 11.1
                        if mode_choice[0] == "walk":
                            speed_mps = 1.34
                        elif mode_choice[0] == "bike":
                            speed_mps = 4.17
                        
                        duration_seconds = total_dist_meters / speed_mps
                        
                        st.success("🎉 路網計算完成！")
                        
                        # Show stats
                        stat_col1, stat_col2 = st.columns(2)
                        with stat_col1:
                            st.metric("📏 總規劃距離", f"{round(total_dist_meters, 1)} 公尺")
                        with stat_col2:
                            mins = round(duration_seconds / 60, 1)
                            st.metric("⏳ 預估時間", f"{mins} 分鐘")
                        
                        # Convert coordinates to simple dataframe for rendering
                        df_points = pd.DataFrame(path_coords, columns=["lat", "lon"])
                        st.map(df_points, zoom=14)
                        
                        # Prepare data payload for saving
                        analysis_name = f"{start_addr} 至 {end_addr} ({mode_choice[1].split(' ')[1]})"
                        
                        # Store in session state to allow uploading
                        st.session_state["last_analysis"] = {
                            "name": analysis_name,
                            "start_name": start_addr,
                            "end_name": end_addr,
                            "mode": mode_choice[0],
                            "coordinates": path_coords,
                            "distance_meters": total_dist_meters,
                            "duration_seconds": duration_seconds
                        }
                    except Exception as e:
                        st.error(f"最短路徑計算失敗: {e}")
                        st.stop()

        # Upload section
        if "last_analysis" in st.session_state:
            curr = st.session_state["last_analysis"]
            st.write("---")
            st.markdown(f"**待上傳規劃**：`{curr['name']}`")
            if st.button("💾 將此分析結果儲存並上傳至 Supabase", type="primary", width="stretch"):
                try:
                    res = sb.table("route_analyses").insert(curr).execute()
                    st.success("🚀 上傳成功！React 前端地圖已即時更新載入！")
                    # Clear session state
                    del st.session_state["last_analysis"]
                except Exception as e:
                    st.error(f"上傳 Supabase 失敗: {e}\n請確認您的 database 表格 'route_analyses' 是否已成功建立。")
