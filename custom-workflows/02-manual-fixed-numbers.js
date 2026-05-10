import fs from 'fs';

export default async function(api) {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) {
        console.error("❌ 조종기(page)를 찾을 수 없습니다.");
        return { status: "fail", message: "조종기 연결 실패" };
    }

    try {
        console.log("=== 📱 [테스트] 모바일 세션 + 메뉴 강제 오픈 + 시야 추적 ===");
        
        console.log("📡 모바일 메인 페이지(튕김 없음) 접속 중...");
        await page.goto("https://m.dhlottery.co.kr/common.do?method=main", { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(3000);

        console.log("👆 잔액을 불러오기 위해 햄버거 메뉴(≡) 클릭 시도...");
        await page.evaluate(() => {
            // 모바일 메뉴 버튼(클래스명)을 모조리 찾아서 클릭
            const menuBtns = document.querySelectorAll('.gnb_btn, .btn_menu, #gnb, .header a');
            menuBtns.forEach(btn => btn.click());
        });
        
        // 메뉴가 스르륵 열리고 서버에서 잔액을 가져올 때까지 5초 대기
        console.log("⏳ 메뉴 애니메이션 및 잔액 수신 대기 (5초)...");
        await page.waitForTimeout(5000);

        // 🔍 [사용자님 요청: 시야 추적 모드 필수 포함]
        const allText = await page.evaluate(() => document.body.innerText);
        console.log("------------------------------------------");
        console.log("👀 [로봇이 보고 있는 화면 전체 (최대 1500자)]");
        console.log(allText.substring(0, 1500));
        console.log("------------------------------------------");

        // 잔액 추출 (로그아웃 되었는지, 가짜 0원인지 판별 포함)
        currentBalance = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            
            // 아예 '로그인' 글자가 있으면 튕긴 것임
            if (bodyText.includes("로그인해주세요") || bodyText.includes("로그아웃") === false) {
                return "로그아웃됨";
            }

            const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
            if (match && match[1]) {
                const val = match[1].replace(/[^0-9]/g, '');
                return val !== "" ? val : "0";
            }
            return "추출실패";
        });

        console.log(`✅ 최종 추출된 예치금 상태: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 작업 중 에러 발생: ${e.message}`);
        status = "fail";
        message = `에러: ${e.message}`;
    }

    // ⏰ 아침 6시 기준 구매 판단
    const kstTimeFinal = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
    const hour = kstTimeFinal.getHours();

    if (hour >= 0 && hour < 6) {
        console.log("⚠️ 아직 점검 시간(00~06시)입니다. 잔액만 저장합니다.");
        message = "잔액 동기화 완료 (점검시간)";
    } else {
        console.log("🚀 6시가 넘었습니다! 로또 구매 시도 중...");
        try {
            const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
            const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
            
            if (api.purchaseManual) {
                 await api.purchaseManual([targetNumbers]); 
                 console.log(`✅ 로또 구매 성공! 번호: [${targetNumbers.join(', ')}]`);
                 message = "로또 구매 성공!";
            }
        } catch (error) {
            console.log(`❌ 구매 에러: ${error.message}`);
            message = `구매 에러: ${error.message}`;
            status = "fail";
        }
    }

    // 결과 저장
    try {
        const resultData = { balance: currentBalance, status: status, message: message, last_run: new Date().toISOString() };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 업데이트 완료");
    } catch (e) {}

    return { status, message, balance: currentBalance };
}
