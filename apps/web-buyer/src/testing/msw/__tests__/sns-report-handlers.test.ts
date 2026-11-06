import { beforeEach, describe, expect, it } from 'vitest'
import { axiosInstance, errorResponse, setAccessToken } from '@aechak/api'
import {
  SNS_BLOCKER,
  SNS_COCO,
  SNS_ME,
  SNS_POST_BLOCKER,
  SNS_POST_COCO,
  SNS_POST_DELETED,
  SNS_POST_MINE,
  SNS_POST_SPAM,
  currentSns,
  seedSns,
} from '../server'

// SNS-07 신고 접수 MSW 핸들러의 계약 검증. 화면 테스트가 이 판정 순서와 에러 코드를 전제로 한다.

async function failureOf(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    const response = errorResponse(error)
    if (!response) throw error
    return { status: response.status, errorCode: response.data?.errorCode }
  }
  throw new Error('요청이 실패해야 하는데 성공했다')
}

const report = (targetType: string, targetId: string, reasonCode = 'SPAM', reasonText: string | null = null) =>
  axiosInstance.post('/reports', { targetType, targetId, reasonCode, reasonText })

beforeEach(() => {
  seedSns()
  setAccessToken('test-token')
})

describe('POST /reports SNS_POST', () => {
  it('[AC-SNS-RPT-030] 볼 수 없는 게시물, 차단한 작성자, 본인 게시물, 기타 상세 없음, 중복을 계약 순서대로 거절한다', async () => {
    expect(await failureOf(report('SNS_POST', SNS_POST_DELETED))).toEqual({ status: 404, errorCode: 130400 })
    expect(await failureOf(report('SNS_POST', SNS_POST_BLOCKER))).toEqual({ status: 404, errorCode: 130400 })
    expect(await failureOf(report('SNS_POST', SNS_POST_SPAM))).toEqual({ status: 403, errorCode: 130001 })
    expect(await failureOf(report('SNS_POST', SNS_POST_MINE))).toEqual({ status: 400, errorCode: 130800 })
    expect(await failureOf(report('SNS_POST', SNS_POST_COCO, 'OTHER', ' \n '))).toEqual({ status: 400, errorCode: 130801 })

    expect((await report('SNS_POST', SNS_POST_COCO)).status).toBe(201)
    expect(await failureOf(report('SNS_POST', SNS_POST_COCO, 'ABUSE'))).toEqual({ status: 409, errorCode: 130802 })
    expect(currentSns().reports).toHaveLength(1)
  })

  it('[AC-SNS-RPT-030] 비로그인은 401이고 500자를 넘는 상세는 90001이다', async () => {
    expect(await failureOf(report('SNS_POST', SNS_POST_COCO, 'OTHER', 'a'.repeat(501)))).toEqual({
      status: 400,
      errorCode: 90001,
    })
    setAccessToken(null)
    expect(await failureOf(report('SNS_POST', SNS_POST_COCO))).toEqual({ status: 401, errorCode: 20004 })
  })
})

describe('POST /reports SNS_USER', () => {
  it('[AC-SNS-RPT-031] 차단 관계와 상관없이 접수하고 자기 자신, 없는 사용자, 기타 상세 없음, 중복을 거절한다', async () => {
    expect((await report('SNS_USER', SNS_BLOCKER)).status).toBe(201)
    expect(await failureOf(report('SNS_USER', SNS_ME))).toEqual({ status: 400, errorCode: 30200 })
    expect(await failureOf(report('SNS_USER', 'missing'))).toEqual({ status: 404, errorCode: 130000 })
    expect(await failureOf(report('SNS_USER', SNS_COCO, 'OTHER'))).toEqual({ status: 400, errorCode: 30201 })
    expect(await failureOf(report('SNS_USER', SNS_BLOCKER, 'FRAUD'))).toEqual({ status: 409, errorCode: 30202 })
  })
})
