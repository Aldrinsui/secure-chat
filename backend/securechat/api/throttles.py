from rest_framework.throttling import UserRateThrottle

class MessageSendThrottle(UserRateThrottle):
    rate = '60/min'
