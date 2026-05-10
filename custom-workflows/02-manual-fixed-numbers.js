import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    if (!page) return { status: "fail", message: "조종기 연결 실패" };

    let currentBalance = "0";
    let status = "success";

    try {
        console.log("=== 📡 [사용자 제안] API 직접 호출(getUserBalance) 작전 ===");

        // 1. 👻 스텔스 설정 (API 호출 시 로봇 의심 차단)
        await page.addInitScript(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });

        // 2. 세션 유지를 위해 우선 메인 페이지 안착
        console.log("📡 세션 유지를 위해 메인 접속...");
        await page.goto("https://dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle" });

        // 3. 💡 [사용자 제안 코드 적용] API 직접 찌르기
        console.log("🔍 서버에게 직접 잔액을 물어봅니다...");
        const balanceResponse = await page.evaluate(async () => {
            try {
                const res = await fetch('https://dhlottery.co.kr/user.do?method=getUserBalance', {
                    credentials: 'include' // 로그인 쿠키 동봉
                });
                return await res.text(); // 일단 텍스트로 다 받아봄
            } catch (e) {
                return `ERROR: ${e.message}`;
            }
        });

        console.log("==========================================");
        console.log("👀 [API 서버 응답 원본]:");
        console.log(balanceResponse);
        console.log("==========================================");

        // 4. 응답 해석 (JSON인지, 숫자만 있는지, 에러인지 판별)
        if (balanceResponse.includes("ERROR")) {
            console.log("❌ API 호출 자체 실패");
        } else {
            // 숫자만 골라내기 (예: {"balance":10000} 혹은 그냥 10000)
            const match = balanceResponse.match(/\d+/g);
            if (match) {
                currentBalance = match[match.length - 1]; // 가장 마지막에 나오는 숫자를 잔액으로 추정
                console.log(`✅ API에서 낚아챈 잔액: ${currentBalance}원`);
            }
        }

    } catch (e) {
        console.log(`❌ 작업 중 에러: ${e.message}`);
        status = "fail";
    }

    // 🚀 실전 구매 프로세스 (API가 성공했거나 로그인이 확인되면 시도)
    console.log("🚀 로또 실전 구매 시도...");
    try {
        const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
        const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
        if (api.purchaseManual && (currentBalance !== "0" || status === "success")) {
            await api.purchaseManual([targetNumbers]);
            console.log("✅ 구매 시도 완료");
        }
    } catch (err) {
        console.log(`알림: ${err.message}`);
    }

    // 결과 저장
    const resultData = { balance: currentBalance, last_run: new Date().toISOString() };
    fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));

    return { status: "success", balance: currentBalance };
}
