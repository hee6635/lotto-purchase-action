/**
 * 02. 리모컨 어플 연동 수동 구매
 *
 * 어플에서 전송한 번호를 받아와서 수동으로 구매합니다.
 * 번호가 제대로 오지 않았을 경우를 대비해 백업 번호도 준비해 둡니다.
 */

export default async ({ purchaseManual }) => {
  console.log('=== 리모컨 어플 연동 수동 구매 시작 ===');

  // 1. 깃허브 환경변수에서 어플이 보낸 번호 꺼내기 (예: "10,16,21,37,42,45")
  const rawNumbers = process.env['INPUT_LOTTO-NUMBERS'];
  
  let targetNumbers = [];

  // 2. 어플에서 번호가 잘 도착했는지 확인
  if (rawNumbers) {
    console.log(`📱 어플에서 수신된 원본 데이터: ${rawNumbers}`);
    
    // "10,16,21" 같은 문자열을 로봇이 이해할 수 있게 숫자 배열 [10, 16, 21] 로 변환
    const parsedArray = rawNumbers.split(',').map(n => parseInt(n.trim(), 10));
    
    // 구매 엔진 규칙에 맞게 2차원 배열 형태로 포장 [ [10, 16...] ]
    targetNumbers = [parsedArray];
    console.log('🎯 세팅 완료된 수동 번호:', JSON.stringify(targetNumbers));
    
  } else {
    // 혹시라도 어플에서 번호가 안 넘어왔을 때 에러나지 않게 방어 (백업 번호)
    console.log('⚠️ 어플 번호를 찾을 수 없습니다! 백업 번호로 진행합니다.');
    targetNumbers = [
      [1, 2, 3, 4, 5, 6] // 이 번호로 사지면 어플 연동이 안 된 것
    ];
  }

  // 3. 진짜 구매 시도!
  try {
    const purchased = await purchaseManual(targetNumbers);
    console.log('✅ 수동 구매 완료:', purchased);
  } catch (error) {
    console.error('❌ 수동 구매 중 에러 발생:', error.message);
  }
};
