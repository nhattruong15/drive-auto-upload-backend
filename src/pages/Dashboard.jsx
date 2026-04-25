import { useEffect, useState, useRef } from "react"
import "./dashboard.scss"

const CLIENT_ID = "521531118633-055oc38ogturkmokigi0clg5ulug5fjv.apps.googleusercontent.com";
const SCOPES = "https://www.googleapis.com/auth/drive.file";

export default function Dashboard() {
  const [tokenInfo, setTokenInfo] = useState(null)
  const [dirHandle, setDirHandle] = useState(null)
  const [driveFolder, setDriveFolder] = useState("")
  const [files, setFiles] = useState([]) // danh sách file đã upload thành công
  const [isRunning, setIsRunning] = useState(false)
  const [statusText, setStatusText] = useState("Idle")

  const tokenClient = useRef(null)
  const uploadedNames = useRef(new Set())
  const runningRef = useRef(false)
  const checkingRef = useRef(false)

  useEffect(() => {
    // Tải script Google Identity Services
    const script = document.createElement("script")
    script.src = "https://accounts.google.com/gsi/client"
    script.async = true
    script.defer = true
    script.onload = () => {
      tokenClient.current = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse) => {
          if (tokenResponse && tokenResponse.access_token) {
            setTokenInfo(tokenResponse)
            setStatusText("Google Authenticated!")
          }
        },
      })
    }
    document.body.appendChild(script)
  }, [])

  const handleLogin = () => {
    if (tokenClient.current) {
      tokenClient.current.requestAccessToken()
    }
  }

  const selectFolder = async () => {
    try {
      const handle = await window.showDirectoryPicker({
        mode: "read"
      })
      setDirHandle(handle)
      setStatusText(`Đã chọn thư mục: ${handle.name}`)
    } catch (e) {
      console.log(e)
    }
  }

  const extractDriveId = () => {
    const id = driveFolder.split("/folders/")[1]?.split("?")[0]
    if (id) {
        setDriveFolder(id)
        setStatusText("Đã tách ID thư mục")
    }
  }

  const uploadFile = async (file, accessToken) => {
    setStatusText(`Uploading ${file.name}...`)
    
    // Step 1: Create metadata for the file
    const metaRes = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: file.name, parents: [driveFolder] })
    })

    if(!metaRes.ok) throw new Error("Metadata Creation Failed")
    const metaData = await metaRes.json()

    // Step 2: Upload file content
    const uploadRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${metaData.id}?uploadType=media`, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": file.type || "application/octet-stream"
      },
      body: file
    })

    if(!uploadRes.ok) throw new Error("File Upload Failed")
    const uploadData = await uploadRes.json()

    return metaData // Contains ID and Name
  }

  const checkFolder = async () => {
    if (!dirHandle || !driveFolder || !tokenInfo) return;
    if (checkingRef.current) return; // Prevent concurrent overlapping executions

    checkingRef.current = true;
    try {
        let hasNew = false;
        for await (const entry of dirHandle.values()) {
        if (entry.kind === 'file') {
            if (!uploadedNames.current.has(entry.name)) {
                hasNew = true;
                // Phát hiện file mới: Đánh dấu file này vào danh sách ngay lập tức
                // Để phòng ngừa tiến trình khác quét đè lại file
                uploadedNames.current.add(entry.name)
                
                try {
                    const file = await entry.getFile()
                    const result = await uploadFile(file, tokenInfo.access_token)
                    if (result.id) {
                        setFiles(prev => [...prev, {id: result.id, name: entry.name}])
                    }
                } catch(e) {
                    console.error("Upload failed", e)
                    // Nếu lỗi thì xóa khỏi ds để upload lại ở nhịp sau
                    uploadedNames.current.delete(entry.name)
                }
            }
        }
        }
        if(!hasNew && runningRef.current){
            setStatusText("Đang chờ ảnh mới...")
        }
    } catch (error) {
        console.error("Directory Handle Error!", error)
        setStatusText("Lỗi đọc thư mục, vui lòng chọn lại quyền (Web Browser bị khóa quyền nếu reload)")
        setIsRunning(false)
        runningRef.current = false
    } finally {
        checkingRef.current = false;
    }
  }

  useEffect(() => {
    let interval;
    if (isRunning) {
      runningRef.current = true
      // Check ngay lập tức
      checkFolder()
      // Lặp lại mỗi 2 giây
      interval = setInterval(checkFolder, 2000)
    } else {
      runningRef.current = false
    }
    return () => clearInterval(interval)
  }, [isRunning, dirHandle, driveFolder, tokenInfo])

  const handleStart = () => {
    if (!tokenInfo) return alert("Vui lòng đăng nhập Google Drive")
    if (!dirHandle) return alert("Vui lòng chọn thư mục ảnh trên máy tính")
    if (!driveFolder) return alert("Vui lòng nhập ID thư mục Drive")
    
    setIsRunning(true)
  }

  const handleStop = () => {
    setIsRunning(false)
    setStatusText("Đã dừng.")
  }

  return (
    <div className="dashboard">
      <div className="card">
        <h1 style={{textAlign:"center",fontSize:"40px", marginBottom: "10px"}}>
          Auto Upload Google Drive
        </h1>
       

        <div className="form">
          <div className="form-group">
            <h3>1. Kết nối Google Drive</h3>
            <div className="input-row">
              {tokenInfo ? (
                <span style={{color:"#34d399", padding:"10px", fontWeight:"bold"}}>✓ Đã chứng thực Google</span>
              ) : (
                <button className="btn" onClick={handleLogin}>
                  Login Google
                </button>
              )}
            </div>
          </div>

          <div className="form-group">
            <h3>
              2. Chọn thư mục nội bộ (Local Folder)
            </h3>
            <div className="input-row">
              <input
                value={dirHandle ? dirHandle.name : ""}
                readOnly
                placeholder="Ví dụ: D:/photo"
              />
              <button className="btn" onClick={selectFolder}>
                Pick Folder
              </button>
            </div>
          </div>

          <div className="form-group">
            <h3>
              3. ID Thư mục Google Drive (Cần bắt buộc)
            </h3>
            <div className="input-row">
              <input
                value={driveFolder}
                onChange={(e)=>setDriveFolder(e.target.value)}
                placeholder="Dán URL thư mục ở đây..."
                disabled={isRunning}
              />
              <button className="btn-outline" onClick={extractDriveId} disabled={isRunning}>
                Extract ID
              </button>
            </div>
          </div>

          <div className="status-panel">
            <div className="status-box">
              <span className="status-label">Trạng thái</span>
              <span className="status-value" style={{color: statusText.includes('Đang chờ') ? '#a78bfa' : '#f8fafc'}}>{statusText}</span>
            </div>

            <div className="status-box highlight">
              <span className="status-label">Đã tải lên</span>
              <span className="status-value">{files.length}</span>
            </div>
          </div>

          {isRunning ? (
            <button className="btn-start stop" onClick={handleStop}>
              ■ Stop Auto Upload
            </button>
          ) : (
            <button className="btn-start" onClick={handleStart}>
              ▶ Start Auto Upload
            </button>
          )}

        </div>
         <div className="footer">
        <span>
          Designed  by <strong>truonghocitngu</strong>
        </span>
      </div>
      </div>

      <div className="gallery">
        {files.map((file)=>{
          const url = `https://drive.google.com/thumbnail?id=${file.id}&sz=w1000`;
          return (
            <div className="gallery-card" key={file.id} onClick={()=>window.open(url)}>
              <img
                src={url}
                alt={file.name}
                onError={(e) => {e.target.style.display='none'}}
              />
              <p>{file.name}</p>
            </div>
          )
        })}
      </div>

     
    </div>
  )
}