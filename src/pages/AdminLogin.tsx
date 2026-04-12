import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { adminLogin } from "@/lib/api";

export default function AdminLogin() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await adminLogin(password);
      if (res?.token) {
        sessionStorage.setItem("admin_token", res.token);
        navigate("/admin/dashboard");
      } else {
        setError("密码错误！");
      }
    } catch {
      setError("登录失败，请重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-muted p-4">
      <div className="max-w-md w-full bg-card rounded-2xl shadow-xl overflow-hidden p-8 transition-all hover:scale-[1.02]">
        <div className="text-center mb-8">
          <ShieldCheck className="w-16 h-16 text-admin-primary mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-card-foreground">站长管理后台</h1>
          <p className="text-muted-foreground text-sm mt-2">请输入管理密码以继续</p>
        </div>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="管理密码"
            className="w-full px-4 py-3 rounded-lg border border-input focus:ring-2 focus:ring-admin-primary focus:border-transparent outline-none mb-4 transition-all bg-background text-foreground"
          />
          {error && <p className="text-destructive text-sm mb-4">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-admin-primary hover:opacity-90 text-admin-primary-foreground font-bold py-3 rounded-lg transition-colors shadow-lg"
          >
            {loading ? "登录中..." : "登录后台"}
          </button>
        </form>
      </div>
    </div>
  );
}
