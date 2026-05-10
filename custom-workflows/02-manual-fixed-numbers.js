import fs from 'fs';

export default async (api) => {
    const page = api.page || (api.session ? api.session.page : null);
    
    let currentBalance = "--";
    let status = "success";
    let message = "작업 완료";

    if (!page) {
        console.error("❌ 조종기(page)를 찾을 수 없습니다.");
        return { status: "fail", message: "조종기 연결 실패" };
    }

    try {
        console.log("=== 📱 예치금 및 로또 자동화 작업 시작 ===");
        
        // 💡 깃허브 서버(UTC) 시계를 한국 시간(KST)으로 맞춤
        const kstTime = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const hour = kstTime.getHours();
        console.log(`⏰ 현재 한국 시간: ${kstTime.toLocaleString('ko-KR')}`);

        // 1. 예치금 추출 (숫자가 뜰 때까지 넉넉하게 4초 대기)
        console.log("📡 예치금 조회를 위해 마이페이지 접속 중...");
        await page.goto("https://dhlottery.co.kr/user.do?method=myPage", { waitUntil: "networkidle", timeout: 30000 });
        await page.waitForTimeout(4000); // 👈 4초로 늘려서 로딩을 충분히 기다립니다.

        // 2. 엉뚱한 0원 방지! "예치금" 주변 숫자만 정밀 타겟팅
        currentBalance = await page.evaluate(() => {
            // 1순위: PC/모바일 헤더 영역의 명확한 태그
            const headerMoney = document.querySelector('.money strong') || document.querySelector('.my_money');
            if (headerMoney && headerMoney.innerText.includes(',')) {
                return headerMoney.innerText.replace(/[^0-9]/g, '');
            }

            // 2순위: 전체 텍스트에서 '예치금' 글자 바로 옆의 숫자만 가져옴
            const bodyText = document.body.innerText;
            const match = bodyText.match(/예치금\s*[:\n]?\s*([0-9,]+)\s*원/);
            if (match) return match[1].replace(/[^0-9]/g, '');

            return "--"; // 아무것도 못 찾으면 0원이 아니라 -- 로 반환
        });

        console.log(`✅ 현재 예치금 확인 완료: ${currentBalance}원`);

    } catch (e) {
        console.log(`❌ 예치금 확인 실패: ${e.message}`);
        status = "fail";
        message = `예치금 확인 에러`;
    }

    // 3. 로또 수동 구매 시도 (한국 시간 기준 방어)
    try {
        const kstTime = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
        const hour = kstTime.getHours();
        
        if (hour >= 0 && hour < 6) {
            console.log("⚠️ 현재는 로또 구매 불가 시간(00:00~06:00)입니다. 예치금 정보만 업데이트하고 종료합니다.");
            message = "구매 불가 시간 (잔액 동기화 완료)";
        } else {
            console.log("🚀 로또 구매 시도 중...");
            const inputEnv = process.env.INPUT_LOTTO_NUMBERS;
            const targetNumbers = inputEnv ? inputEnv.split(',').map(Number) : [10, 16, 21, 37, 42, 45];
            
            if (api.purchaseManual) {
                 await api.purchaseManual([targetNumbers]); 
                 console.log(`✅ 로또 구매 성공! 번호: [${targetNumbers.join(', ')}]`);
                 message = "로또 구매 성공!";
            }
        }
    } catch (e) {
        console.log(`❌ 구매 실패 로그: ${e.message}`);
        status = "fail";
        message = `로또 구매 실패: ${e.message}`;
    }

    // 4. 어플(React) 동기화를 위해 result.json 파일 생성
    try {
        const resultData = {
            balance: currentBalance,
            status: status,
            message: message,
            last_run: new Date().toISOString() // 이건 어플 트리거용이므로 그냥 둠
        };
        fs.writeFileSync('result.json', JSON.stringify(resultData, null, 2));
        console.log("✅ result.json 파일 업데이트 완료");
    } catch (e) {
        console.log(`❌ result.json 저장 실패: ${e.message}`);
    }

    console.log("=== 🏁 모든 작업 종료 ===");
    return { status, message, balance: currentBalance };
};
